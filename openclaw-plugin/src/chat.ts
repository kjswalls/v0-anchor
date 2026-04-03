import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginConfig } from "./plugin-types.js";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { readBody } from "./webhook.js";

const SESSION_KEY_PREFIX = "anchor-chat";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  // Required for Chrome's Private Network Access policy when a public origin
  // (Vercel) fetches directly to a private/Tailscale host.
  "Access-Control-Allow-Private-Network": "true",
};

export async function handleChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: PluginConfig,
  runtime: PluginRuntime,
  logger: { info: (s: string) => void; warn: (s: string) => void; error: (s: string) => void }
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== cfg.apiKey) {
    res.writeHead(401, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let message: string;
  let sessionKey: string;
  let extraContext: string | undefined;

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as { message?: string; sessionKey?: string; context?: string };
    if (!body.message?.trim()) {
      res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing message" }));
      return;
    }
    message = body.message.trim();
    sessionKey = body.sessionKey ?? `${SESSION_KEY_PREFIX}:${cfg.apiKey.slice(-8)}`;
    extraContext = body.context;
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (data: string) => res.write(`data: ${data}\n\n`);

  try {
    logger.info(`anchor-context: chat turn — session ${sessionKey}`);

    const { runId } = await runtime.subagent.run({
      sessionKey,
      message,
      idempotencyKey: `anchor-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(extraContext ? { extraSystemPrompt: extraContext } : {}),
    });

    const result = await runtime.subagent.waitForRun({ runId, timeoutMs: 120_000 });

    if (result.status === "error") {
      logger.warn(`anchor-context: chat run errored — ${result.error ?? "unknown"}`);
      send(JSON.stringify({ error: result.error ?? "Agent run failed" }));
      return;
    }

    const { messages } = await runtime.subagent.getSessionMessages({ sessionKey, limit: 10 });

    const lastAssistant = [...messages].reverse().find((m) => {
      const msg = m as Record<string, unknown>;
      return msg.role === "assistant";
    }) as Record<string, unknown> | undefined;

    if (!lastAssistant) {
      send(JSON.stringify({ error: "No response received" }));
      return;
    }

    let text = "";
    const content = lastAssistant.content;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null)
        .filter((block) => block.type === "text")
        .map((block) => block.text as string)
        .join("");
    }

    if (text) {
      send(JSON.stringify({ content: text }));
    } else {
      send(JSON.stringify({ error: "Empty response" }));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`anchor-context: chat handler error — ${msg}`);
    send(JSON.stringify({ error: msg }));
  } finally {
    send("[DONE]");
    res.end();
  }
}
