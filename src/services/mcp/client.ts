// MCP HTTP client — JSON-RPC 2.0 over HTTP
//
// 和 stdio 方式的本质区别：每个 JSON-RPC 请求是一次独立的 HTTP POST，
// 不需要行缓冲区、pending 匹配表、子进程管理。
//
// 协议流：initialize → tools/list → tools/call
// 参考：https://spec.modelcontextprotocol.io/

import type { McpServerConfig } from './types.js'
import { McpToolCallError } from './errors.js'

// ─── JSON-RPC 消息结构 ────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ─── MCP Tool 数据结构 ─────────────────────────────────────────────────

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}

// ─── MCP Client ───────────────────────────────────────────────────────

export class McpClient {
  private requestId = 0
  private url = ''
  private headers: Record<string, string> = {}
  private _serverInfo: { name: string; version: string } | null = null

  get serverInfo() { return this._serverInfo }

  async connect(name: string, config: McpServerConfig): Promise<void> {
    this.url = config.url
    this.headers = { 'content-type': 'application/json', ...config.headers }

    // Initialize 握手（部分 HTTP MCP 服务器不需要，静默跳过）
    try {
      const result = await this.rawRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mini-cc', version: '0.1.0' },
      }) as { serverInfo?: { name: string; version: string } } | undefined
      if (result?.serverInfo) this._serverInfo = result.serverInfo
      // Fire-and-forget initialized 通知
      this.rawRequest('notifications/initialized', {}).catch(() => {})
    } catch {
      // HTTP MCP 可能不需要 initialize 步骤
    }
  }

  // ── 工具发现 ─────────────────────────────────────────────────────

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.rawRequest('tools/list', {}) as { tools: McpToolDefinition[] } | undefined
    return result?.tools ?? []
  }

  // ── 工具调用 ─────────────────────────────────────────────────────

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = await this.rawRequest('tools/call', { name, arguments: args }) as McpToolResult | undefined
    if (!result) throw new McpToolCallError('unknown', name, 'no result')
    return result
  }

  // ── JSON-RPC over HTTP ──────────────────────────────────────────

  private async rawRequest(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId
    const body = { jsonrpc: '2.0', id, method, params }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const json = await response.json() as JsonRpcResponse
    if (json.error) {
      throw new Error(`JSON-RPC error ${json.error.code}: ${json.error.message}`)
    }

    return json.result
  }

  // ── 创建 mini-cc Tool 适配器 ────────────────────────────────────

  toMiniCCTool(mcpTool: McpToolDefinition, serverName: string) {
    const prefixedName = `mcp__${serverName}__${mcpTool.name}`
    return {
      name: prefixedName,
      description: mcpTool.description ?? '',
      input_schema: {
        type: 'object' as const,
        ...(mcpTool.inputSchema as Record<string, unknown> | undefined),
      },
      isMcp: true,
      alwaysLoad: mcpTool._meta?.['anthropic/alwaysLoad'] === true,
      searchHint: typeof mcpTool._meta?.['anthropic/searchHint'] === 'string'
        ? mcpTool._meta['anthropic/searchHint'].replace(/\s+/g, ' ').trim()
        : undefined,
      isConcurrencySafe: () => false,
      interruptBehavior: () => 'block' as const,
      call: async (input: Record<string, unknown>) => {
        const result = await this.callTool(mcpTool.name, input)
        return result.content
          .filter(c => c.type === 'text')
          .map(c => c.text ?? '')
          .join('\n')
      },
    }
  }
}
