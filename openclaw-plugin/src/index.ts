import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PluginConfig } from './plugin-types.js'
import { fetchContext, isCacheFresh } from './cache.js'
import { buildHeader, buildFullContext } from './context.js'
import { registerWithAnchor, registerChatUrl, deregisterFromAnchor, parseWebhookBody, verifyHmac } from './webhook.js'
import { handleChatRequest } from './chat.js'
import { runSetup } from './setup.js'

export default definePluginEntry({
  id: 'anchor-context',
  name: 'Anchor Context',
  description: 'Relevance-gated Anchor task/habit context with push-based cache invalidation',

  register(api) {
    // ── Setup CLI: openclaw anchor-context setup ──────────────────────────────
    api.registerCli(({ program }) => {
      program
        .command('anchor-context')
        .description('Anchor Context plugin management')
        .addCommand(
          program
            .createCommand('setup')
            .description('Interactive setup — connect OpenClaw to your Anchor account')
            .action(() => runSetup())
        )
    }, { commands: ['anchor-context'] })

    const cfg = (api.pluginConfig as Record<string, unknown>)?.['anchor-context'] as PluginConfig | undefined
    if (!cfg?.anchorUrl || !cfg?.apiKey) {
      api.logger.warn(
        'anchor-context: not configured. Run `openclaw anchor-context setup` to connect your Anchor account.'
      )
      return
    }

    const ttlMs = cfg.cacheTtlMs ?? 5 * 60 * 1000

    // ── Seed cache + register webhook on startup ──────────────────────────────
    fetchContext(cfg).then(async () => {
      const { getCache } = await import('./cache.js')
      const c = getCache()
      api.logger.info(
        `anchor-context: ready — ${c?.tasks.length ?? 0} tasks, ${c?.habits.length ?? 0} habits`
      )

      const gatewayPublicUrl = cfg.publicUrl?.replace(/\/$/, '')

      if (gatewayPublicUrl) {
        await registerWithAnchor(cfg, `${gatewayPublicUrl}/plugins/anchor/webhook`, api.logger)
        await registerChatUrl(cfg, `${gatewayPublicUrl}/plugins/anchor/chat`, api.logger)
      } else {
        api.logger.warn(
          'anchor-context: publicUrl not set in plugin config — webhook push and chat URL registration disabled. ' +
          'Add publicUrl to your anchor-context plugin config in openclaw.json.'
        )
      }
    }).catch((err: Error) => {
      api.logger.warn(`anchor-context: initial fetch failed — ${err.message}`)
    })

    // ── Deregister on shutdown ────────────────────────────────────────────────
    api.registerService({
      id: 'anchor-context-lifecycle',
      start: async () => { /* nothing to start */ },
      stop: async () => {
        await deregisterFromAnchor(cfg, api.logger)
      },
    })

    // ── Chat route: Anchor sidebar → agent turn → SSE stream ─────────────────
    api.registerHttpRoute({
      path: '/plugins/anchor/chat',
      auth: 'plugin',
      async handler(req: IncomingMessage, res: ServerResponse) {
        if (req.method !== 'POST' && req.method !== 'OPTIONS') {
          res.writeHead(405)
          res.end('Method Not Allowed')
          return
        }
        await handleChatRequest(req, res, cfg, api.runtime, api.logger)
      },
    })

    // ── Webhook listener: Anchor → cache invalidation ─────────────────────────
    // OpenClaw uses Node's IncomingMessage/ServerResponse, not the Web Fetch API
    api.registerHttpRoute({
      path: '/plugins/anchor/webhook',
      auth: 'plugin',
      async handler(req: IncomingMessage, res: ServerResponse) {
        const { body, eventName } = await parseWebhookBody(req, cfg)

        if (cfg.webhookSecret) {
          const sig = (req.headers['x-anchor-signature'] as string) ?? ''
          const valid = await verifyHmac(cfg.webhookSecret, body, sig)
          if (!valid) {
            res.writeHead(401)
            res.end('Unauthorized')
            return
          }
        }

        api.logger.info(`anchor-context: cache invalidated (${eventName})`)
        fetchContext(cfg).catch((err: Error) => {
          api.logger.warn(`anchor-context: post-change refresh failed — ${err.message}`)
        })

        res.writeHead(200)
        res.end('ok')
      },
    })

    // ── Inject context into every prompt turn via before_prompt_build hook ───
    // Uses api.on() instead of registerMemoryPromptSection so we don't need
    // the exclusive memory slot (which would displace memory-core).
    api.on('before_prompt_build', async (event) => {
      // Refresh cache if stale
      if (!isCacheFresh(ttlMs)) {
        try { await fetchContext(cfg) } catch (err) {
          api.logger.warn(`anchor-context: cache refresh failed — ${(err as Error).message}`)
        }
      }

      const lastUserMessage = typeof event.prompt === 'string' ? event.prompt : ''
      const isPlanning = (msg: string) => [
        'task', 'tasks', 'todo', 'habit', 'habits', 'project', 'schedule',
        'today', 'tomorrow', 'plan', 'reminder', 'overdue', 'priority',
        'what should i', 'what do i', "what's on", 'on my list',
        'working on', 'finish', 'complete', 'done', 'streak',
      ].some(kw => msg.toLowerCase().includes(kw))

      const content = isPlanning(lastUserMessage)
        ? buildFullContext() || buildHeader()
        : buildHeader()

      if (!content) return
      return { prependContext: content }
    })
  },
})
