// 流式调用 LLM API：支持 Anthropic 和 OpenAI 兼容两种协议
//
// 根据模型名自动选择：claude- 开头走 Anthropic，deepseek- 开头走 OpenAI 协议
// 两个分支都产出统一的 StreamEvent，上层无需感知差异

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { Tool } from '../../Tool.js'
import type { StreamEvent } from '../../types/stream.js'

// ─── Provider 探测 ────────────────────────────────────────────

function getProvider(model: string): 'anthropic' | 'openai' {
  if (model.startsWith('claude-') || model.startsWith('anthropic-')) return 'anthropic'
  return 'openai' // deepseek、qwen、以及其他 OpenAI 兼容 API
}

// ─── Anthropic 协议 ───────────────────────────────────────────

type AccToolUse = {
  id: string
  name: string
  input: string // 未 parse 的 JSON 片段
}

async function* streamAnthropic(
  messages: MessageParam[],
  tools: Tool[] | undefined,
  options: { model: string; maxTokens: number },
): AsyncGenerator<StreamEvent, MessageParam> {
  const client = new Anthropic()
  const stream = client.messages.stream({
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
    tools: tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
  })

  const toolAccs = new Map<number, AccToolUse>()
  const textParts: string[] = []

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      const block = event.content_block
      if (block.type === 'tool_use') {
        toolAccs.set(event.index, { id: block.id, name: block.name, input: '' })
      }
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta
      if (delta.type === 'text_delta') {
        textParts.push(delta.text)
        yield { type: 'text_delta', text: delta.text }
      } else if (delta.type === 'input_json_delta') {
        const acc = toolAccs.get(event.index)
        if (acc) acc.input += delta.partial_json
      }
    } else if (event.type === 'content_block_stop') {
      const acc = toolAccs.get(event.index)
      if (acc && acc.input) {
        yield { type: 'tool_use', name: acc.name, input: JSON.parse(acc.input) as Record<string, unknown> }
      }
    } else if (event.type === 'message_delta') {
      yield { type: 'done', stop_reason: event.delta.stop_reason ?? undefined }
    }
  }

  return buildAssistantMessage(textParts, toolAccs)
}

// ─── OpenAI 兼容协议（DeepSeek / Qwen / 等） ──────────────────

type OpenAIToolAcc = { id: string; name: string; arguments: string }

async function* streamOpenAI(
  messages: MessageParam[],
  tools: Tool[] | undefined,
  options: { model: string; maxTokens: number },
): AsyncGenerator<StreamEvent, MessageParam> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
  })

  const stream = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages: toOpenAIMessages(messages),
    tools: tools?.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    })),
    stream: true,
    stream_options: { include_usage: true },
  })

  // text_delta 和 tool_calls 可能交错到达，分别累积
  const textParts: string[] = []
  const toolAccs = new Map<number, OpenAIToolAcc>()
  let stopReason: string | undefined

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    if (!choice) continue

    const delta = choice.delta

    // 文本增量：实时转发
    if (delta?.content) {
      textParts.push(delta.content)
      yield { type: 'text_delta', text: delta.content }
    }

    // 工具调用增量：按 index 累积（每个 index 可能分多次到达）
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        let acc = toolAccs.get(tc.index)
        if (!acc) {
          acc = { id: '', name: '', arguments: '' }
          toolAccs.set(tc.index, acc)
        }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name = tc.function.name
        if (tc.function?.arguments) acc.arguments += tc.function.arguments
      }
    }

    // 记录结束原因
    if (choice.finish_reason) {
      stopReason = choice.finish_reason === 'stop' ? 'end_turn'
        : choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : undefined
    }
  }

  // 流结束后统一产出 tool_use（OpenAI 的 tool_calls 在 finish_reason 后停止）
  for (const [, acc] of toolAccs) {
    const input = acc.arguments ? JSON.parse(acc.arguments) as Record<string, unknown> : {}
    yield { type: 'tool_use', name: acc.name, input }
  }
  yield { type: 'done', stop_reason: stopReason }

  return buildAssistantMessage(textParts, toolAccs)
}

// ─── 消息格式转换（Anthropic → OpenAI） ───────────────────────

function toOpenAIMessages(msgs: MessageParam[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []
  for (const msg of msgs) {
    const blocks = typeof msg.content === 'string'
      ? [{ type: 'text' as const, text: msg.content }]
      : msg.content

    if (msg.role === 'user') {
      const textBlocks = blocks.filter(b => b.type === 'text')
      const toolResults = blocks.filter(b => b.type === 'tool_result')

      // tool_result 在 OpenAI 中用 role: 'tool' 发送
      for (const tr of toolResults) {
        result.push({
          role: 'tool',
          tool_call_id: tr.tool_use_id,
          content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
        } as ChatCompletionMessageParam)
      }
      // 纯文本消息
      if (textBlocks.length > 0) {
        const text = textBlocks.map(b => (b as { text: string }).text).join('')
        result.push({ role: 'user', content: text || '.' })
      }
    } else if (msg.role === 'assistant') {
      const textBlock = blocks.find(b => b.type === 'text')
      const toolBlocks = blocks.filter(b => b.type === 'tool_use')

      const entry: ChatCompletionMessageParam = {
        role: 'assistant',
        content: textBlock ? (textBlock as { text: string }).text : null,
        ...(toolBlocks.length > 0 ? {
          tool_calls: toolBlocks.map(b => ({
            id: (b as { id: string }).id,
            type: 'function' as const,
            function: {
              name: (b as { name: string }).name,
              arguments: JSON.stringify((b as { input: Record<string, unknown> }).input),
            },
          })),
        } : {}),
      }
      result.push(entry)
    }
  }
  return result
}

// ─── 共用：从累积状态构建 assistant 消息 ─────────────────────
type AccEntry = { id: string; name: string } & ({ input: string } | { arguments: string })

function buildAssistantMessage(
  textParts: string[],
  accs: Map<number, AccEntry>,
): MessageParam {
  const content: ContentBlockParam[] = []
  if (textParts.length > 0) {
    content.push({ type: 'text' as const, text: textParts.join('') })
  }
  for (const [, acc] of accs) {
    const rawInput = 'input' in acc ? acc.input : (acc as OpenAIToolAcc).arguments
    content.push({
      type: 'tool_use' as const,
      id: acc.id,
      name: acc.name,
      input: rawInput ? (JSON.parse(rawInput) as Record<string, unknown>) : {},
    })
  }
  return { role: 'assistant', content }
}

// ─── 导出：自动选择协议 ───────────────────────────────────────

export async function* streamMessage(
  messages: MessageParam[],
  tools?: Tool[],
  options?: { model?: string; maxTokens?: number },
): AsyncGenerator<StreamEvent, MessageParam> {
  const model = options?.model ?? 'claude-sonnet-4-20250514'
  const maxTokens = options?.maxTokens ?? 4096

  const provider = getProvider(model)
  const generator = provider === 'anthropic'
    ? streamAnthropic(messages, tools, { model, maxTokens })
    : streamOpenAI(messages, tools, { model, maxTokens })

  // 转发所有事件并透传返回值
  return yield* generator
}
