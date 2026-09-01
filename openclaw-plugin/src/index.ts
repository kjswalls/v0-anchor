import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PluginConfig } from './plugin-types.js'
import { fetchContext, markCacheDirty } from './cache.js'
import { registerWithDsul, registerChatUrl, deregisterFromDsul, parseWebhookBody, verifyHmac } from './webhook.js'
import { handleChatRequest } from './chat.js'
import { runSetup } from './setup.js'
import { registerTools } from './tools.js'

export default definePluginEntry({
  id: 'dsul-context',
  name: 'dsul Context',
  description: 'Relevance-gated dsul task/habit context with push-based cache invalidation',

  register(api) {
    // ── Setup CLI: openclaw dsul-context setup ──────────────────────────────
    api.registerCli(({ program }) => {
      program
        .command('dsul-context')
        .description('dsul Context plugin management')
        .addCommand(
          program
            .createCommand('setup')
            .description('Interactive setup — connect OpenClaw to your dsul account')
            .action(() => runSetup())
        )
    }, { commands: ['dsul-context'] })

    const cfg = (api.pluginConfig as Record<string, unknown>)?.['dsul-context'] as PluginConfig | undefined
    if (!cfg?.dsulUrl || !cfg?.apiKey) {
      api.logger.warn(
        'dsul-context: not configured. Run `openclaw dsul-context setup` to connect your dsul account.'
      )
      return
    }

    registerTools(api, cfg)

    // ── Seed cache + register webhook on startup ──────────────────────────────
    fetchContext(cfg).then(async () => {
      const { getCache } = await import('./cache.js')
      const c = getCache()
      api.logger.info(
        `dsul-context: ready — ${c?.tasks.length ?? 0} tasks, ${c?.habits.length ?? 0} habits`
      )

      const gatewayPublicUrl = cfg.publicUrl?.replace(/\/$/, '')

      if (gatewayPublicUrl) {
        // Issue #141: without a secret the webhook route accepts any caller who
        // can reach the gateway — the HMAC check below is skipped entirely.
        if (!cfg.webhookSecret) {
          api.logger.warn(
            'dsul-context: webhookSecret not set — the webhook endpoint is UNAUTHENTICATED and will ' +
            'accept unsigned requests. Set webhookSecret in your dsul-context plugin config in openclaw.json.'
          )
        }
        await registerWithDsul(cfg, `${gatewayPublicUrl}/plugins/dsul/webhook`, api.logger)
        const agentId = cfg.agentId?.trim() || cfg.id?.trim() || 'main'
        await registerChatUrl(
          cfg,
          `${gatewayPublicUrl}/plugins/dsul/chat`,
          agentId,
          api.logger
        )
      } else {
        api.logger.warn(
          'dsul-context: publicUrl not set in plugin config — webhook push and chat URL registration disabled. ' +
          'Add publicUrl to your dsul-context plugin config in openclaw.json.'
        )
      }
    }).catch((err: Error) => {
      api.logger.warn(`dsul-context: initial fetch failed — ${err.message}`)
    })

    // ── Deregister on shutdown ────────────────────────────────────────────────
    api.registerService({
      id: 'dsul-context-lifecycle',
      start: async () => { /* nothing to start */ },
      stop: async () => {
        await deregisterFromDsul(cfg, api.logger)
      },
    })

    // ── Webhook listener: dsul → cache invalidation ─────────────────────────
    // OpenClaw uses Node's IncomingMessage/ServerResponse, not the Web Fetch API
    api.registerHttpRoute({
      path: '/plugins/dsul/webhook',
      auth: 'plugin',
      async handler(req: IncomingMessage, res: ServerResponse) {
        const { body, eventName } = await parseWebhookBody(req)

        if (cfg.webhookSecret) {
          const sig = (req.headers['x-dsul-signature'] as string) ?? ''
          const valid = await verifyHmac(cfg.webhookSecret, body, sig)
          if (!valid) {
            res.writeHead(401)
            res.end('Unauthorized')
            return
          }
        }

        api.logger.info(`dsul-context: cache invalidated (${eventName})`)
        markCacheDirty()
        fetchContext(cfg).catch((err: Error) => {
          api.logger.warn(`dsul-context: post-change refresh failed — ${err.message}`)
        })

        res.writeHead(200)
        res.end('ok')
      },
    })

    // ── Chat endpoint: browser → plugin (blocking JSON) ──────────────────────
    api.registerHttpRoute({
      path: '/plugins/dsul/chat',
      auth: 'plugin',
      async handler(req: IncomingMessage, res: ServerResponse) {
        await handleChatRequest(req, res, cfg, api.runtime, api.logger)
      },
    })

  },
})
