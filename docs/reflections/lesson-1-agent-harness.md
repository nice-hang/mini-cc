# 第 1 课：Agent Harness — while(true) 循环 + 流式 API

> 本教程是 mini-cc 系列的第 1 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 1 课。
> 代码实现见 `src/query/` + `src/services/api/claude.ts`，参考源码为 claude-code 的 `deps/claude-code/src/query.ts` + `services/api/claude.ts`。

---

## 本质

Agent Harness 是一个 **while(true) 循环**：

```
调用模型 → 解析响应 → 如果有工具调用 → 执行工具 → 回到开头
                              → 如果没有    → 结束
```

它不是"调用一次 API 拿到结果"，而是一个持续交互的对话过程——模型可以反复调工具、看结果、再调工具，直到它认为任务完成。

## 为什么需要它

没有 Harness 的 LLM 调用是一次性的：问一个问题，得到一个回答。但真实任务（读文件、写代码、搜索网页）需要模型与环境交互：

- 模型说"我要读 `package.json`" → 你去读 → 把结果给它 → 它看完说"还要读 `tsconfig.json`" → 你再去读...
- 如果没有循环，每次工具调用后程序就结束了，模型无法基于工具结果继续推理。

Harness 就是这个"持续对话"的骨架。

## 设计意图

Claude Code 的 Harness 设计围绕三个核心考量：

- **约束 1：流式体验** — 用户不能等整个响应生成完才看到文字。必须边生成边推送（text_delta），让用户感知模型在"思考"。
- **约束 2：协议无关** — 不能只绑死 Anthropic API。DeepSeek、Qwen 等用 OpenAI 兼容协议，Harness 必须能切换 provider 而不影响上层逻辑。
- **Trade-off：回调 vs Generator** — claude-code 原版用 `AsyncGenerator` + `yield*` 实现事件流。但 `yield` 在非 Generator 函数中无法使用，CLI 入口必须手动 `await generator.next()` 迭代，反而增加了理解成本。mini-cc 最终改用 `onEvent` 回调，在保持流式能力的同时降低了 CLI 的复杂度。

## 关键模式

### 模式 1：onEvent 回调驱动

Harness 不直接返回完整响应，而是通过 `onEvent` 回调逐片推送数据：

```typescript
type StreamEvent =
  | { type: 'text_delta'; text: string }        // 模型生成的文本片段
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }  // 工具调用
  | { type: 'done'; stop_reason?: string }       // 本轮结束

// query() 接收回调，内部逐层转发
const terminal = await query(messages, tools, (event) => {
  if (event.type === 'text_delta') process.stdout.write(event.text)
})
```

**为什么这样设计？** CLI 拿到 `text_delta` 立刻写入 stdout，用户就能在终端上实时看到模型输出，无需等整个响应完成。

### 模式 2：provider 自动探测

根据模型名前缀选择 API 协议：

```typescript
function getProvider(model: string): 'anthropic' | 'openai' {
  if (model.startsWith('claude-') || model.startsWith('anthropic-')) return 'anthropic'
  return 'openai'
}
```

两个分支都接收 Anthropic 的 `MessageParam[]` 作为内部格式，`streamOpenAI` 在发送前通过 `toOpenAIMessages()` 转换成 OpenAI 格式。这样 query.ts 不需要知道用的是什么协议。

**为什么这样设计？** 双协议支持不需要抽象层（不需要 `interface LLMProvider`）。一个 `if/else` 就够了，新增协议只在函数内改，不影响调用方。

### 模式 3：流式累积 tool_use

工具调用的参数是分片到达的，不能逐片回调 `onEvent({ type: 'tool_use' })`，否则上层会收到不完整的 JSON。

Anthropic 的流式事件结构：

```
content_block_start → { index: 0, content_block: { type: 'tool_use', id: 'tu_xxx', name: 'read_file', input: '' } }
content_block_delta → { index: 0, delta: { type: 'input_json_delta', partial_json: '{"file' } }
content_block_delta → { index: 0, delta: { type: 'input_json_delta', partial_json: '"_path":"' } }
content_block_delta → { index: 0, delta: { type: 'input_json_delta', partial_json: 'package.json"}' } }
content_block_stop  → { index: 0 }  ← 此时 JSON 完整，可以 parse 并回调
```

OpenAI 的类似，但用 `tool_calls[index].function.arguments` 累积字符串。

两个分支的实现差异完全封装在 `claude.ts` 内部，对外都产出同样的 `StreamEvent`。

## 实现要点

### Happy Path

最小可用流程：

1. CLI 从 stdin 读取用户输入
2. `query()` 开始 while(true) 循环
3. `streamMessage()` 调用模型 API，通过 `onEvent` 逐片转发
4. 响应中提取 `tool_use` block
5. 如果有 → 执行对应工具（`read_file` / `write_file` / `bash` / `web_fetch`）→ 追加结果到消息历史 → 继续循环
6. 如果没有 → 返回 `{ reason: 'done' }`

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 最大轮数 | `maxTurns` 参数（默认 25），超限返回 `{ reason: 'max_turns' }` |
| 工具执行失败 | 捕获异常，以 `is_error: true` 返回错误信息，让模型决定下一步 |
| 不存在的工具 | 返回 `Unknown tool: xxx`，模型通常会修正 |
| 连续同角色消息 | `normalizeMessages()` 合并相邻 user 或 assistant 消息，防止 API 报错 |
| 首条是 assistant | 自动插入 `{ role: 'user', content: '.' }` 占位 |
| 缺少 API key | CLI 启动时检查，明确提示设置哪个环境变量 |

### DeepSeek 的特殊处理

DeepSeek 的 `reasoning_content`（思考链）不是标准 OpenAI 字段，必须在后续请求中原样传回，否则 400 错误。

处理方式：在流式响应中捕获 `delta.reasoning_content`，保存在 `MessageParam` 的扩展属性上，`toOpenAIMessages()` 时再注入请求。使用 `as unknown as Record<string, string>` 绕过 TypeScript 的类型限制，影响范围控制在 claude.ts 内部。

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/query/query.ts` | `deps/claude-code/src/query.ts` | mini-cc 用 `onEvent` 回调 + `Promise<Terminal>`；原版用 `AsyncGenerator<Terminal, StreamEvent>`。核心 while(true) 结构一致 |
| `src/services/api/claude.ts` | `deps/claude-code/src/services/api/claude.ts` | mini-cc 合并了 Anthropic 和 OpenAI 双协议在一个文件；原版拆得更细。流式累积 tool_use 的逻辑相同 |
| `src/utils/messages.ts` | `deps/claude-code/src/utils/messages.ts` | 功能子集：只有 `normalizeMessages` + `buildToolResultMessage`，去掉了 `appendErrorMessage` 等辅助函数 |
| `src/Tool.ts` | `deps/claude-code/src/Tool.ts` | 只保留核心类型，去掉 enum `ToolExecutionMode`、`ToolGroup` 等后续课程才需要的定义 |
| `src/cli/readline.ts` | — | 自实现，claude-code 使用更复杂的 REPL 系统 |

mini-cc 的核心简化策略：**每课只实现当前课程所需的最小类型和函数**。第 1 课不需要 `ToolGroup`、不需要 `PermissionCheck`、不需要 `ContextCompaction`，这些在后续课程中逐步添加。

## 学到的设计教训

1. **AsyncGenerator 不是银弹** — `yield*` 在非 Generator 函数中无法使用，导致 CLI 入口必须手动 `await generator.next()` 迭代，比回调更复杂。如果你的系统只有"一个生产者 → 一个消费者"，回调比 Generator 简单。

2. **双协议支持不需要抽象层** — 一个 `if/else` 根据模型名选择分支就够了。不需要定义 `interface LLMProvider`，不需要 `Strategy Pattern`。代码量不到 200 行的文件直接放两个协议实现，比拆成多个文件更易读。**过早抽象是万恶之源。**

3. **流式累积自然解决了 tool_use 乱序问题** — 因为 tool_use 的参数是逐片到达的，等到 `content_block_stop` / `finish_reason` 才回调，保证了上层拿到的 `input` 永远是完整的 JSON。这个设计让 query.ts 完全不需要处理"tool_use 参数还没到齐"的情况。

4. **内部格式统一 = 协议转换成本可控** — 让所有代码用 Anthropic 的 `MessageParam[]` 作为内部消息格式，只在发送到 OpenAI 协议时才转换。这样新增 provider 只需写一个新的 `toXxxMessages()` 函数，所有上层代码不受影响。

---

*本教程由 mini-cc 项目在完成第 1 课后自动生成。*
