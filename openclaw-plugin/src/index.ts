import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PluginConfig } from './plugin-types.js'
import { fetchContext, isCacheFresh } from './cache.js'
import { buildHeader, buildFullContext } from './context.js'
import { registerWithAnchor, deregisterFromAnchor, parseWebhookBody, verifyHmac } from './webhook.js'
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

      const gatewayPublicUrl = (
        (api.config as Record<string, unknown>)?.gateway as Record<string, unknown> | undefined
      )?.publicUrl as string | undefined

      if (gatewayPublicUrl) {
        await registerWithAnchor(cfg, `${gatewayPublicUrl}/plugins/anchor/webhook`, api.logger)
      } else {
        api.logger.warn(
          'anchor-context: gateway.publicUrl not set — push invalidation disabled. ' +
          'Set it in openclaw.json for real-time cache updates.'
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
        if (req.method !== 'POST') {
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

    // ── Inject context into every prompt turn ─────────────────────────────────
    // registerMemoryPromptSection: sync builder, returns string[], params have availableTools
    api.registerMemoryPromptSection((_params) => {
      // Kick off async refresh if stale (fire-and-forget — builder must be sync)
      if (!isCacheFresh(ttlMs)) {
        fetchContext(cfg).catch((err: Error) => {
          api.logger.warn(`anchor-context: background refresh failed — ${err.message}`)
        })
      }

      // Note: lastUserMessage isn't available in this builder signature.
      // We default to full context here; a future OpenClaw version may expose
      // the current message for relevance gating.
      const content = buildFullContext() || buildHeader()
      return content ? [content] : []
    })
  },
})
