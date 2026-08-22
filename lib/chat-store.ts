import { create } from 'zustand';
import { usePlannerStore } from './planner-store';
import { useAISettingsStore } from './ai-settings-store';
import { buildAnchorContext } from './ai-context';
import { buildBeaconSystemPrompt } from './beacon-system-prompt';
import { stripReasoningTags } from './chat-utils';

/**
 * Shared chat state + streaming logic for Beacon/OpenClaw, extracted from
 * chat-sidebar so the desktop chat panel and mobile chat panel render the
 * same conversation (previously ~500 duplicated lines).
 *
 * Now a store FACTORY: the global Beacon conversation is one instance
 * (`useChatStore`, byte-compatible with the old singleton), and each item's
 * thread is another (`itemChatStore(id)`), keyed by its own localStorage
 * history and its own OpenClaw sessionKey — the plugin passes a client-chosen
 * sessionKey straight through to `runtime.subagent.run`, so per-item threads
 * need no plugin change (openclaw-plugin/src/chat.ts).
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const ITEM_HISTORY_PREFIX = 'anchor-item-chat-';

/**
 * Per-thread transcript cap. localStorage is ~5MB for the WHOLE origin and
 * eight other stores persist into it; when it fills, `setItem` throws for all
 * of them, so a runaway thread doesn't break chat, it breaks view prefs and
 * the morning check. Trim the oldest rather than risk the ceiling.
 */
const MAX_STORED_MESSAGES = 100;

interface ChatThreadConfig {
  /** localStorage key for this thread's transcript. */
  historyKey: string;
  /** OpenClaw-side conversation identity (server history lives per key). */
  sessionKey: string;
  /** Narrow the Beacon context onto one item (per-item threads). */
  focusItemId?: string;
}

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  hydrated: boolean;

  /** OpenClaw connection info (fetched when the provider is openclaw). */
  openclawChatUrl: string | null;
  openclawAgentIdDisplay: string | null;
  openclawAnchorApiKey: string | null;

  /** Load persisted history (24h TTL). Call once from the shell. */
  hydrate: () => void;
  /** Fetch or clear OpenClaw info to match the current provider. */
  syncOpenclawInfo: () => void;
  clear: () => void;
  stop: () => void;
  send: (text: string) => Promise<void>;
}

export function createChatStore(config: ChatThreadConfig) {
  const { historyKey, sessionKey, focusItemId } = config;

  function saveHistory(messages: ChatMessage[]) {
    if (messages.length === 0) return;
    const stored =
      messages.length > MAX_STORED_MESSAGES ? messages.slice(-MAX_STORED_MESSAGES) : messages;
    try {
      localStorage.setItem(historyKey, JSON.stringify({ messages: stored, savedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  // Per-store: stopping one thread must not kill another thread's stream.
  let abortController: AbortController | null = null;

  return create<ChatStore>()((set, get) => {
    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const messages = updater(get().messages);
      set({ messages });
      saveHistory(messages);
    };

    const patchLastAssistant = (patch: (last: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = patch(last);
        return next;
      });
    };

    return {
      messages: [],
      isLoading: false,
      isTyping: false,
      hydrated: false,
      openclawChatUrl: null,
      openclawAgentIdDisplay: null,
      openclawAnchorApiKey: null,

      hydrate: () => {
        if (get().hydrated) return;
        set({ hydrated: true });
        try {
          const raw = localStorage.getItem(historyKey);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (
            parsed?.savedAt &&
            Date.now() - parsed.savedAt < HISTORY_TTL_MS &&
            Array.isArray(parsed.messages)
          ) {
            set({ messages: parsed.messages });
          } else {
            localStorage.removeItem(historyKey);
          }
        } catch {
          localStorage.removeItem(historyKey);
        }
      },

      syncOpenclawInfo: () => {
        if (useAISettingsStore.getState().provider !== 'openclaw') {
          set({ openclawChatUrl: null, openclawAgentIdDisplay: null, openclawAnchorApiKey: null });
          return;
        }
        fetch('/api/agent/chat-url')
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((chatData) =>
            set({
              openclawChatUrl: chatData.chatUrl ?? null,
              openclawAgentIdDisplay: chatData.agentId ?? null,
              openclawAnchorApiKey: chatData.anchorApiKey ?? null,
            })
          )
          .catch(() =>
            set({ openclawChatUrl: null, openclawAgentIdDisplay: null, openclawAnchorApiKey: null })
          );
      },

      clear: () => {
        set({ messages: [] });
        try {
          localStorage.removeItem(historyKey);
        } catch {
          /* ignore */
        }
      },

      stop: () => {
        abortController?.abort();
        abortController = null;
      },

      send: async (text) => {
        const trimmed = text.trim();
        if (!trimmed || get().isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
        const updatedMessages = [...get().messages, userMessage];
        setMessages(() => updatedMessages);
        set({ isLoading: true });
        setMessages((prev) => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);

        try {
          const { items, projects, habitGroups, itemTypes, routines, programs, goals, userTimezone } =
            usePlannerStore.getState();
          const context = buildAnchorContext({
            items, projects, habitGroups, routines, programs, goals, focusItemId, userTimezone,
          });
          // Fresh values via getState() to avoid stale closures.
          const { provider, apiKey, model, systemPrompt } = useAISettingsStore.getState();
          // Custom-type nouns reach the model through the default prompt; a
          // user-customized prompt wins untouched.
          const effectiveSystemPrompt =
            systemPrompt ||
            buildBeaconSystemPrompt(itemTypes.map((t) => t.labelPlural.toLowerCase()));

          if (provider === 'openclaw') {
            const { openclawChatUrl, openclawAnchorApiKey } = get();
            if (!openclawChatUrl) {
              patchLastAssistant(() => ({
                role: 'assistant',
                content:
                  'OpenClaw not connected yet — run `openclaw anchor-context setup` and set publicUrl in openclaw.json.',
                timestamp: Date.now(),
              }));
              set({ isLoading: false });
              return;
            }
            set({ isTyping: true });
            abortController?.abort();
            const controller = new AbortController();
            abortController = controller;
            try {
              const res = await fetch(openclawChatUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(openclawAnchorApiKey ? { Authorization: `Bearer ${openclawAnchorApiKey}` } : {}),
                },
                signal: controller.signal,
                body: JSON.stringify({ message: trimmed, sessionKey, context }),
              });
              // The plugin answers with one JSON body, not a stream (#149). It
              // used to write SSE framing around a single payload it only
              // emitted once the whole run finished, so there was never
              // anything incremental to read.
              const parsed = (await res.json()) as { content?: string; error?: string };
              const accumulated = parsed.error ? `Error: ${parsed.error}` : (parsed.content ?? '');
              patchLastAssistant((last) => ({
                ...last,
                content: stripReasoningTags(accumulated) || 'No response received.',
                timestamp: Date.now(),
              }));
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') return;
              const msg = err instanceof Error ? err.message : 'Unknown error';
              patchLastAssistant(() => ({
                role: 'assistant',
                content: `Could not reach plugin: ${msg}`,
                timestamp: Date.now(),
              }));
            } finally {
              if (abortController === controller) abortController = null;
              set({ isTyping: false, isLoading: false });
            }
            return;
          }

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: updatedMessages,
              context,
              provider,
              apiKey,
              model,
              systemPrompt: effectiveSystemPrompt,
            }),
          });

          if (!res.body) throw new Error('No response body');

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') break;
              try {
                const { content } = JSON.parse(payload);
                if (content) {
                  patchLastAssistant((last) => ({ ...last, content: last.content + content }));
                }
              } catch {
                /* skip malformed */
              }
            }
          }
        } catch {
          patchLastAssistant((last) =>
            last.content === ''
              ? {
                  role: 'assistant',
                  content: 'Sorry, something went wrong. Please try again.',
                  timestamp: Date.now(),
                }
              : last
          );
        } finally {
          set({ isLoading: false });
        }
      },
    };
  });
}

export type ChatStoreHook = ReturnType<typeof createChatStore>;

/** The global Beacon conversation — the pre-factory singleton, unchanged. */
export const useChatStore = createChatStore({
  historyKey: 'anchor-chat-history',
  sessionKey: 'anchor-chat',
});

// Per-item threads, created lazily and cached for hook identity — a component
// must get the SAME store instance across renders or zustand resubscribes
// every render. Bounded in practice by how many item panels a session opens.
const itemChatStores = new Map<string, ChatStoreHook>();

export function itemChatStore(itemId: string): ChatStoreHook {
  let store = itemChatStores.get(itemId);
  if (!store) {
    store = createChatStore({
      historyKey: `anchor-item-chat-${itemId}`,
      sessionKey: `anchor-item-${itemId}`,
      focusItemId: itemId,
    });
    itemChatStores.set(itemId, store);
  }
  return store;
}

/** Walk every stored item-thread key. Backwards, since removal reindexes. */
function forEachItemThreadKey(fn: (key: string) => void) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(ITEM_HISTORY_PREFIX)) fn(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Drop expired item transcripts at boot.
 *
 * The 24h TTL is only checked when a thread is OPENED, so a transcript for an
 * item you never revisit is never swept — it just sits there, and the pile only
 * grows. Sweeping once per session keeps the origin's shared quota from filling
 * with conversations nobody will read again.
 */
function sweepExpiredItemThreads() {
  const now = Date.now();
  forEachItemThreadKey((key) => {
    let expired = true;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
      expired = !parsed?.savedAt || now - parsed.savedAt >= HISTORY_TTL_MS;
    } catch {
      expired = true; // unparseable is also worth reclaiming
    }
    if (expired) localStorage.removeItem(key);
  });
}

// New provider → fresh transcripts (avoid mixing Beacon / OpenClaw threads)
// and re-sync connection info. Module-scope subscription; inert on the server.
if (typeof window !== 'undefined') {
  sweepExpiredItemThreads();
  let prevProvider = useAISettingsStore.getState().provider;
  useAISettingsStore.subscribe((state) => {
    if (state.provider !== prevProvider) {
      prevProvider = state.provider;
      useChatStore.getState().clear();
      useChatStore.getState().syncOpenclawInfo();
      // Item threads follow the same rule — a thread must never interleave
      // replies from two different providers. Clearing the instantiated
      // stores isn't enough: transcripts for threads not opened THIS session
      // live only in localStorage and would hydrate into the new provider.
      itemChatStores.forEach((store) => store.getState().clear());
      forEachItemThreadKey((key) => localStorage.removeItem(key));
    }
  });
}
