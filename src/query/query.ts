// Agent 核心循环：发消息 → 拿响应 → 执行工具 → 再发消息
//
// while(true) 循环：
// 1. 调用模型 API 流式获取响应（通过 onEvent 回调实时产出事件）
// 2. 如果响应包含 tool_use → 按并发安全分组 → 执行工具 → 追加结果到消息历史 → 继续
// 3. 如果响应不包含 tool_use → 结束
//
// 动态 discovery 列表先保留为 attachment，再渲染成 message，避免塞进 Tool description。

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import type { StreamEvent } from '../types/stream.js'
import type { Attachment } from '../attachments/types.js'
import { renderAttachmentsAsMessages } from '../attachments/render.js'
import { streamMessage } from '../services/api/claude.js'
import { buildToolResultMessage, normalizeMessages } from '../utils/messages.js'
import { partitionToolCalls, executeToolGroups } from '../services/tools/partition.js'
import { consumeDeferredToolSchemaDelta } from '../services/tools/tool_search.js'

export type Terminal = { reason: 'done' | 'max_turns' | 'error'; error?: string }
export type QueryOptions = {
  model?: string
  maxTokens?: number
  maxTurns?: number
  systemPrompt?: string
  attachments?: Attachment[]
}

export async function query(
  messages: MessageParam[],
  tools: Tool[] | undefined,
  onEvent: (e: StreamEvent) => void,
  options?: QueryOptions,
): Promise<Terminal> {
  const maxTurns = options?.maxTurns ?? 25

  // 构建工具查找表，用于执行阶段按名索引
  const getTool = (name: string) => tools?.find(t => t.name === name)

  for (let turn = 1; turn <= maxTurns; turn++) {
    const requestMessages = withAttachments(messages, options?.attachments)

    // 调用模型，通过 onEvent 实时转发流式事件
    const assistantMsg = await streamMessage(requestMessages, tools, onEvent, {
      model: options?.model,
      maxTokens: options?.maxTokens,
      system: options?.systemPrompt,
    })

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

    // 教学版没有 Anthropic tool_reference，因此把 ToolSearch 命中的 schema
    // 作为 message delta 追加到历史里，而不是改下一轮请求头部的 tools[]。
    const loadedToolSchemaDelta = consumeDeferredToolSchemaDelta()
    if (loadedToolSchemaDelta) {
      messages.push(...renderAttachmentsAsMessages([loadedToolSchemaDelta]))
    }
  }

  return { reason: 'max_turns' }
}

function withAttachments(
  messages: MessageParam[],
  attachments: Attachment[] | undefined,
): MessageParam[] {
  if (!attachments || attachments.length === 0) return messages

  // attachment 不写入长期历史；每次请求临时渲染，物理上由 user message 承载。
  return normalizeMessages([...renderAttachmentsAsMessages(attachments), ...messages])
}
