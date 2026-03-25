import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import type { PluginConfig } from './types.js'
import { fetchContext, isCacheFresh } from './cache.js'
import { isPlanning, buildHeader, buildFullContext } from './context.js'
import { registerWithAnchor, deregisterFromAnchor, makeWebhookHandler } from './webhook.js'
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
      const cache = (await import('./cache.js')).getCache()
      api.logger.info(
        `anchor-context: ready — ${cache?.tasks.length ?? 0} tasks, ${cache?.habits.length ?? 0} habits`
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
      name: 'anchor-context-lifecycle',
      async stop() {
        await deregisterFromAnchor(cfg, api.logger)
      },
    })

    // ── Webhook listener: Anchor → cache invalidation ─────────────────────────
    api.registerHttpRoute({
      method: 'POST',
      path: '/plugins/anchor/webhook',
      handler: makeWebhookHandler(cfg, api.logger),
    })

    // ── Inject context into every prompt turn ─────────────────────────────────
    api.registerMemoryPromptSection(async ({ lastUserMessage }: { lastUserMessage?: string }) => {
      if (!isCacheFresh(ttlMs)) {
        try { await fetchContext(cfg) } catch { /* serve stale */ }
      }

      const content = isPlanning(lastUserMessage ?? '')
        ? buildFullContext()
        : buildHeader()

      return content ? { role: 'system' as const, content } : null
    })
  },
})
