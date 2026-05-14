// 子 Agent 执行器：创建独立 Agent 实例并运行
//
// 流程：
// 1. 接收已过滤好的工具列表（过滤在 AgentTool 中完成）
// 2. 创建独立的对话历史
// 3. 调用 query() 运行子 Agent 循环
// 4. 收集子 Agent 的文本输出，返回最终结果

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import type { StreamEvent } from '../types/stream.js'
import type { AgentDefinition } from './types.js'
import { query } from '../query/query.js'

export type RunAgentOptions = {
  model?: string
  maxTokens?: number
  maxTurns?: number
  systemPrompt?: string
  onEvent?: (e: StreamEvent) => void
}

export type RunAgentResult = {
  result: string
  terminal: { reason: string; error?: string }
}

export async function runAgent(
  prompt: string,
  agentDef: AgentDefinition,
  agentTools: Tool[],
  options?: RunAgentOptions,
): Promise<RunAgentResult> {
  // 创建独立的对话历史（子 Agent 从零开始）
  const messages: MessageParam[] = [{ role: 'user', content: prompt }]

  // 子 Agent 的系统提示：优先使用外部传入的，否则用定义里的
  const systemPrompt = options?.systemPrompt ?? agentDef.systemPrompt

  // 收集子 Agent 的文本输出
  const textParts: string[] = []

  // 运行子 Agent
  const terminal = await query(messages, agentTools, (event) => {
    if (event.type === 'text_delta') textParts.push(event.text)
    options?.onEvent?.(event)
  }, {
    model: options?.model,
    maxTokens: options?.maxTokens,
    maxTurns: options?.maxTurns,
    systemPrompt,
  })

  return {
    result: textParts.join(''),
    terminal,
  }
}
