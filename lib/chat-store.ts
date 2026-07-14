import { create } from 'zustand';
import { usePlannerStore } from './planner-store';
import { useAISettingsStore } from './ai-settings-store';
import { buildAnchorContext } from './ai-context';
import { BEACON_SYSTEM_PROMPT } from './beacon-system-prompt';
import { stripReasoningTags } from './chat-utils';

/**
 * Shared chat state + streaming logic for Beacon/OpenClaw, extracted from
 * chat-sidebar so the desktop chat panel and mobile chat panel render the
 * same conversation (previously ~500 duplicated lines).
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

const HISTORY_KEY = 'anchor-chat-history';
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

function saveHistory(messages: ChatMessage[]) {
  if (messages.length === 0) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ messages, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

let abortController: AbortController | null = null;

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

export const useChatStore = create<ChatStore>()((set, get) => {
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
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (
          parsed?.savedAt &&
          Date.now() - parsed.savedAt < HISTORY_TTL_MS &&
          Array.isArray(parsed.messages)
        ) {
          set({ messages: parsed.messages });
        } else {
          localStorage.removeItem(HISTORY_KEY);
        }
      } catch {
        localStorage.removeItem(HISTORY_KEY);
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
        localStorage.removeItem(HISTORY_KEY);
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
        const { tasks, habits, projects, habitGroups } = usePlannerStore.getState();
        const context = buildAnchorContext({ tasks, habits, projects, habitGroups });
        // Fresh values via getState() to avoid stale closures.
        const { provider, apiKey, model, systemPrompt } = useAISettingsStore.getState();
        const effectiveSystemPrompt = systemPrompt || BEACON_SYSTEM_PROMPT;

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
              body: JSON.stringify({ message: trimmed, sessionKey: 'anchor-chat', context }),
            });
            if (!res.body) throw new Error('No response body');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';
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
                  const parsed = JSON.parse(payload);
                  if (parsed.error) {
                    // Don't clobber existing content; only set error if nothing received yet
                    if (!accumulated) accumulated = `Error: ${parsed.error}`;
                    break;
                  } else if (parsed.content) {
                    accumulated += parsed.content;
                  }
                } catch {
                  /* skip malformed */
                }
              }
            }
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

// New provider → fresh transcript (avoid mixing Beacon / OpenClaw threads)
// and re-sync connection info. Module-scope subscription; inert on the server.
if (typeof window !== 'undefined') {
  let prevProvider = useAISettingsStore.getState().provider;
  useAISettingsStore.subscribe((state) => {
    if (state.provider !== prevProvider) {
      prevProvider = state.provider;
      useChatStore.getState().clear();
      useChatStore.getState().syncOpenclawInfo();
    }
  });
}
