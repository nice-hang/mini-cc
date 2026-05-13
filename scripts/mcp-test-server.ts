// MCP 测试服务器 — 模拟 JSON-RPC 2.0 over HTTP
//
// 启动后提供两个工具：
//   echo(name) — 返回 "Hello, {name}!"
//   calc(expr) — 计算简单数学表达式
//
// 使用方式：
//   npx tsx scripts/mcp-test-server.ts &
//   export MCP_SERVERS='[{"name":"test","url":"http://localhost:9876/mcp"}]'
//   echo "..." | npm run dev

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const PORT = 9876

// JSON-RPC 方法处理器
const handlers: Record<string, (params: unknown) => unknown> = {
  initialize(params: any) {
    return {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mini-cc-test-server', version: '1.0.0' },
    }
  },

  'tools/list'() {
    return {
      tools: [
        {
          name: 'echo',
          description: '返回你传入的名字的问候语',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '要问候的名字' },
            },
            required: ['name'],
          },
        },
        {
          name: 'calc',
          description: '计算数学表达式',
          inputSchema: {
            type: 'object',
            properties: {
              expr: { type: 'string', description: '数学表达式，如 1+2' },
            },
            required: ['expr'],
          },
        },
      ],
    }
  },

  'tools/call'(params: any) {
    const toolName = params?.name
    const args = params?.arguments ?? {}

    if (toolName === 'echo') {
      return { content: [{ type: 'text', text: `Hello, ${args.name ?? 'world'}!` }] }
    }

    if (toolName === 'calc') {
      try {
        // eslint-disable-next-line no-eval
        const result = eval(args.expr ?? '0')
        return { content: [{ type: 'text', text: `${args.expr} = ${result}` }] }
      } catch {
        return { content: [{ type: 'text', text: `Error: invalid expression` }], isError: true }
      }
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true }
  },
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // 只处理 POST /mcp
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404)
    res.end()
    return
  }

  let body = ''
  req.on('data', (chunk: string) => { body += chunk })
  req.on('end', () => {
    let request: any
    try {
      request = JSON.parse(body)
    } catch {
      res.writeHead(400)
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
      return
    }

    const handler = handlers[request.method]
    if (!handler) {
      res.writeHead(200)
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      }))
      return
    }

    try {
      const result = handler(request.params)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
    } catch (e) {
      res.writeHead(200)
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32603, message: (e as Error).message },
      }))
    }
  })
})

server.listen(PORT, () => {
  console.log(`MCP test server ready at http://localhost:${PORT}/mcp`)
  console.log(`Tools: echo(name), calc(expr)`)
})
