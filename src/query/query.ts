// Agent 核心循环：发消息 → 拿响应 → 执行工具 → 再发消息
//
// 本质是 while(true)：
// 1. 调用模型 API 流式获取响应
// 2. 如果响应包含 tool_use → 执行工具 → 追加结果到消息历史 → 继续
// 3. 如果响应不包含 tool_use → 结束

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import type { StreamEvent } from '../types/stream.js'
import { streamMessage } from '../services/api/claude.js'
import { buildToolResultMessage } from '../utils/messages.js'

export type Terminal = { reason: 'done' | 'max_turns' | 'error'; error?: string }

// 内置工具执行表
const toolHandlers: Record<string, (input: Record<string, unknown>) => Promise<string>> = {
  read_file: async (input) => readFileSync(input.file_path as string, 'utf-8'),
  write_file: async (input) => {
    const path = input.file_path as string
    const content = input.content as string
    writeFileSync(path, content, 'utf-8')
    return `Written to ${path}`
  },
  bash: async (input) => execSync(input.command as string, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }),
  web_fetch: async (input) => {
    const res = await fetch(input.url as string)
    return res.text()
  },
}

async function executeToolUses(blocks: { id: string; name: string; input: Record<string, unknown> }[]) {
  return Promise.all(blocks.map(async (b) => {
    const handler = toolHandlers[b.name]
    if (!handler) return { tool_use_id: b.id, content: `Unknown tool: ${b.name}`, is_error: true }
    try {
      return { tool_use_id: b.id, content: await handler(b.input) }
    } catch (e) {
      return { tool_use_id: b.id, content: `Error: ${(e as Error).message}`, is_error: true }
    }
  }))
}

export async function* query(
  messages: MessageParam[],
  tools?: Tool[],
  options?: { model?: string; maxTokens?: number; maxTurns?: number },
): AsyncGenerator<StreamEvent, Terminal> {
  const maxTurns = options?.maxTurns ?? 25

  for (let turn = 1; turn <= maxTurns; turn++) {
    // 调用模型，实时转发事件，收集 assistant 响应消息
    const generator = streamMessage(messages, tools, options)
    const assistantMsg: MessageParam = yield* generator

    // 从 assistant 响应中提取工具调用
    const content = Array.isArray(assistantMsg.content) ? assistantMsg.content : []
    const toolUses = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
      b.type === 'tool_use'
    )

    // 没调工具 → 对话结束
    if (toolUses.length === 0) return { reason: 'done' }

    // 执行工具并追加到消息历史
    const results = await executeToolUses(toolUses)
    messages.push(assistantMsg)
    messages.push(buildToolResultMessage(results))
  }

  return { reason: 'max_turns' }
}
