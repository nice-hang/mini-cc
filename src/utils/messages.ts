// 消息管理：确保发给 API 的消息格式正确
//
// Anthropic API 要求 user/assistant 严格交替，
// tool_result 在 user 角色下发送，可能产生连续 user 消息需要合并。

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

// 合并相邻同角色消息，确保第一条是 user
export function normalizeMessages(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages

  const result: MessageParam[] = []
  for (const msg of messages) {
    const last = result[result.length - 1]
    if (last && last.role === msg.role) {
      // 合并同角色：将 content 统一为数组后拼接
      const left = typeof last.content === 'string'
        ? [{ type: 'text' as const, text: last.content }]
        : last.content
      const right = typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content
      last.content = [...left, ...right]
    } else {
      result.push({ role: msg.role, content: msg.content })
    }
  }

  // API 不允许以 assistant 开头
  if (result[0].role === 'assistant') {
    result.unshift({ role: 'user', content: '.' })
  }
  return result
}

// 从工具执行结果构建 tool_result 消息
export function buildToolResultMessage(
  results: { tool_use_id: string; content: string; is_error?: boolean }[],
): MessageParam {
  return {
    role: 'user',
    content: results.map(r => ({
      type: 'tool_result' as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
      is_error: r.is_error,
    })),
  }
}
