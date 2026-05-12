// Agent 核心循环：发消息 → 拿响应 → 执行工具 → 再发消息
//
// while(true) 循环：
// 1. 调用模型 API 流式获取响应（通过 onEvent 回调实时产出事件）
// 2. 如果响应包含 tool_use → 按并发安全分组 → 执行工具 → 追加结果到消息历史 → 继续
// 3. 如果响应不包含 tool_use → 结束

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import type { StreamEvent } from '../types/stream.js'
import { streamMessage } from '../services/api/claude.js'
import { buildToolResultMessage } from '../utils/messages.js'
import { partitionToolCalls, executeToolGroups } from '../services/tools/partition.js'

export type Terminal = { reason: 'done' | 'max_turns' | 'error'; error?: string }

export async function query(
  messages: MessageParam[],
  tools: Tool[] | undefined,
  onEvent: (e: StreamEvent) => void,
  options?: { model?: string; maxTokens?: number; maxTurns?: number },
): Promise<Terminal> {
  const maxTurns = options?.maxTurns ?? 25

  // 构建工具查找表，用于执行阶段按名索引
  const getTool = (name: string) => tools?.find(t => t.name === name)

  for (let turn = 1; turn <= maxTurns; turn++) {
    // 调用模型，通过 onEvent 实时转发流式事件
    const assistantMsg = await streamMessage(messages, tools, onEvent, options)

    // 提取工具调用
    const content = Array.isArray(assistantMsg.content) ? assistantMsg.content : []
    const toolUses = content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    )

    if (toolUses.length === 0) return { reason: 'done' }

    // 按并发安全分组执行工具
    const groups = partitionToolCalls(toolUses, getTool)
    const results = await executeToolGroups(groups, getTool)

    messages.push(assistantMsg)
    messages.push(buildToolResultMessage(results))
  }

  return { reason: 'max_turns' }
}
