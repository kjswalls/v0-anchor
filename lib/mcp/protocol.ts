/**
 * protocol.ts — the JSON-RPC 2.0 / MCP wire layer, with no transport in it.
 *
 * Hand-rolled rather than taking @modelcontextprotocol/sdk: a tools-only server
 * needs five methods, the surface is small enough to read in one sitting, and
 * this repo has to be able to run its whole suite offline with no new
 * dependency. If resources, prompts or sampling ever land here, that trade
 * flips and the SDK is the right answer.
 *
 * Everything here is pure — `dispatch` takes a handler map and returns a
 * response object — so protocol conformance is unit-testable without Next, a
 * database, or a socket.
 */

/** The spec revision this server implements. */
export const MCP_PROTOCOL_VERSION = '2025-06-18'

/**
 * Versions we will echo back verbatim if a client asks for them. The spec says
 * to answer with the client's version when supported and our own otherwise;
 * refusing outright would break clients pinned a revision behind for no reason.
 */
const SUPPORTED_PROTOCOL_VERSIONS = new Set([MCP_PROTOCOL_VERSION, '2025-03-26', '2024-11-05'])

export const JSON_RPC_VERSION = '2.0'

/** Standard JSON-RPC codes. MCP adds no codes of its own for a tools server. */
export const RpcError = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const

export interface RpcRequest {
  jsonrpc: string
  /** Absent on a notification, which takes no response at all. */
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface RpcResponse {
  jsonrpc: string
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** What a tool call produced. `isError` is a TOOL failure, not a protocol one. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface DispatchDeps {
  tools: McpToolDescriptor[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>
  serverInfo: { name: string; version: string }
}

const ok = (id: string | number | null, result: unknown): RpcResponse => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  result,
})

const fail = (
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): RpcResponse => ({ jsonrpc: JSON_RPC_VERSION, id, error: { code, message, ...(data ? { data } : {}) } })

/** True for a notification — no `id`, so the caller must send NO response. */
export function isNotification(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    !('id' in message) &&
    typeof (message as { method?: unknown }).method === 'string'
  )
}

/**
 * Handles one JSON-RPC message. Returns null when the message is a
 * notification, which the transport must turn into an empty 202 rather than a
 * body — a response to a notification is a protocol violation, and strict
 * clients disconnect over it.
 */
export async function dispatch(
  message: unknown,
  deps: DispatchDeps
): Promise<RpcResponse | null> {
  if (typeof message !== 'object' || message === null) {
    return fail(null, RpcError.INVALID_REQUEST, 'Request must be a JSON object')
  }

  const req = message as RpcRequest
  const id = req.id ?? null
  const notification = isNotification(message)

  if (req.jsonrpc !== JSON_RPC_VERSION) {
    return notification ? null : fail(id, RpcError.INVALID_REQUEST, 'jsonrpc must be "2.0"')
  }
  if (typeof req.method !== 'string') {
    return notification ? null : fail(id, RpcError.INVALID_REQUEST, 'method must be a string')
  }

  switch (req.method) {
    case 'initialize': {
      const asked = req.params?.protocolVersion
      const version =
        typeof asked === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(asked)
          ? asked
          : MCP_PROTOCOL_VERSION
      return ok(id, {
        protocolVersion: version,
        // Tools only. Declaring resources or prompts we do not serve makes a
        // client list them and find nothing.
        capabilities: { tools: { listChanged: false } },
        serverInfo: deps.serverInfo,
      })
    }

    // Notifications: acknowledged by silence.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null

    case 'ping':
      return notification ? null : ok(id, {})

    case 'tools/list':
      return ok(id, { tools: deps.tools })

    case 'tools/call': {
      const name = req.params?.name
      if (typeof name !== 'string') {
        return fail(id, RpcError.INVALID_PARAMS, 'params.name must be a string')
      }
      const rawArgs = req.params?.arguments
      if (rawArgs !== undefined && (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))) {
        return fail(id, RpcError.INVALID_PARAMS, 'params.arguments must be an object')
      }
      if (!deps.tools.some((t) => t.name === name)) {
        return fail(id, RpcError.INVALID_PARAMS, `Unknown tool: ${name}`)
      }
      try {
        const result = await deps.callTool(name, (rawArgs as Record<string, unknown>) ?? {})
        return ok(id, result)
      } catch (err) {
        // A thrown tool is reported as a TOOL error inside a successful
        // response, not a protocol error: the model should see the failure and
        // get to react, which a JSON-RPC error deprives it of.
        const message = err instanceof Error ? err.message : 'Tool execution failed'
        return ok(id, { content: [{ type: 'text', text: message }], isError: true })
      }
    }

    default:
      return notification ? null : fail(id, RpcError.METHOD_NOT_FOUND, `Unknown method: ${req.method}`)
  }
}
