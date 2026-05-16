# 第 5 课：Subagent 系统

> 本教程是 mini-cc 系列的第 5 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 5 课。
> 代码实现见 `src/coordinator/` + `src/services/tools/agent.ts`，参考源码为 claude-code 的 `deps/claude-code/packages/builtin-tools/src/tools/AgentTool/` + `deps/claude-code/src/coordinator/`。

---

## 本质

> Subagent 系统让 Agent 能在工具调用中创建一个全新的 Agent 循环——每个子 Agent 有独立的对话历史、工具集和 system prompt。

```
父 Agent Loop                 子 Agent Loop
┌──────────────────┐         ┌──────────────────┐
│  用户：查这个 bug   │         │                  │
│  模型：调 AgentTool │───→    │  子 Agent 循环    │
│        │          │         │  query(messages,  │
│        │          │         │   filteredTools,  │
│        │          │         │   subPrompt)      │
│        │          │         │        │          │
│        │          │         │  读文件 → 分析 → 结果 │
│        │          │         │        │          │
│  模型：得到结果     │←────────│  返回文本结果       │
└──────────────────┘         └──────────────────┘
```

核心思想：**让 Agent 能分解问题，把子任务交给专门的"小 Agent"去执行。**

## 为什么需要它

没有 Subagent 系统的 Agent 面临三个困境：

**困境 1：上下文污染**

父 Agent 探索代码时，所有中间结果（读的文件、执行的命令）都混在同一个消息列表里。

```
user: "这个 bug 在哪里？"
assistant: (读了 10 个文件)
assistant: (搜了 3 次代码)
assistant: (最终回答) "在 login.ts 第 42 行"
```

探索产生的中间文件内容占据了上下文窗口，稀释了实际有用的对话信息。

**困境 2：工具权限混在一起**

一个 Agent 要么什么工具都有（能读写能执行命令），要么什么都没有。没有办法说"这个 Agent 只能读不能写"——而只读 Agent 在代码审查、安全分析等场景中非常有用。

**困境 3：没有分工协作**

复杂的软件开发任务需要多种能力：先调研（explore）→ 制定方案（plan）→ 实施（implement）。没有子 Agent，所有工作挤在一个 Agent 里完成，上下文越来越杂，模型越来越"分心"。

Subagent 系统的解法：**每个子 Agent 是一个独立的 `query()` 循环，有自己的一套工具和 system prompt。父 Agent 把子任务委托出去，得到结果后继续自己的工作。**

## 设计意图

### 核心约束

- **独立上下文** — 子 Agent 有自己的消息历史，干净地从零开始。父 Agent 的上下文不被污染
- **工具隔离** — 按 Agent 类型过滤可用工具：explore 只能读，plan 能读写，general 全工具
- **防递归** — 子 Agent 默认不能生成新的子 Agent（看不到 AgentTool），防止无限嵌套
- **同步执行** — 子 Agent 完整运行后返回结果（sync 模式），父 Agent 拿到结果后继续

### Trade-off

| 方案 | 上下文隔离 | 工具过滤 | 复杂度 |
|------|-----------|---------|--------|
| 全在同一个 query 循环 | 无隔离 | 无过滤 | 低 |
| Sync Subagent（本课实现） | 完全隔离 | 按类型过滤 | 中 |
| Async Subagent（claude-code 有） | 完全隔离 | 按类型过滤 | 高 |

mini-cc 选择 Sync 模式：**子 Agent 在父 Agent 的工具执行阶段同步运行，返回结果 text。** 这是最简单的子 Agent 模式——本质就是在一个 Tool 的 `call()` 里调了一次 `query()`。Async 模式依赖任务/通知系统（需要持久化 agent id、跨轮次消息传递），留给后续课程。

## 关键模式

### 模式 1：AgentDefinition — 描述子 Agent 的身份和能力边界

```typescript
export type AgentType = 'general' | 'explore' | 'plan'

export type AgentDefinition = {
  type: AgentType
  name: string
  description: string           // 对模型的描述
  systemPrompt: string           // 子 Agent 的系统提示
  allowedToolNames: string[]     // 空 = 不限制
}
```

**为什么定义为静态数据而非代码？**

AgentDefinition 是"配置"不是"代码"。它声明了三个 Agent 类别的身份和边界：
- **type** 决定工具过滤策略
- **systemPrompt** 告诉子 Agent 它是什么样的角色（"你只能读"、"你可以写"）
- **allowedToolNames** 定义这个 Agent 能用哪些工具

这跟 claude-code 中的 `BaseAgentDefinition` 一样是纯数据定义。claude-code 多了一个 `getSystemPrompt()` 回调用于动态生成提示，mini-cc 用静态字符串——够用了。

### 模式 2：filterToolsForAgent — 双层工具过滤

```typescript
const PARENT_ONLY_TOOLS = new Set(['AgentTool'])

export function filterToolsForAgent(
  agentDef: AgentDefinition,
  allTools: Tool[],
): Tool[] {
  return allTools.filter((tool) => {
    // 1. 防递归：AgentTool 只有父 Agent 能用
    if (PARENT_ONLY_TOOLS.has(tool.name)) return false

    // 2. 空名单 = 不限制
    if (agentDef.allowedToolNames.length === 0) return true

    // 3. 否则只保留名单里的
    return agentDef.allowedToolNames.includes(tool.name)
  })
}
```

**为什么是"两层过滤"？**

第一层是**安全约束**（hard constraint）：任何子 Agent 都不能调 AgentTool。第二层是**职责约束**（soft constraint）：explore 类 Agent 不需要 bash 和写入工具，给了反而会混淆它的职责边界。

在 claude-code 中，第一层对应 `ALL_AGENT_DISALLOWED_TOOLS`（所有 Agent 共享的黑名单），第二层对应每个 Agent 的 `tools` 和 `disallowedTools` 字段。mini-cc 合并为 `allowedToolNames` 白名单——简单但足够灵活。

### 模式 3：runAgent — 子 Agent 的隔离执行

```typescript
export async function runAgent(
  prompt: string,
  agentDef: AgentDefinition,
  allTools: Tool[],
  options?: RunAgentOptions,
): Promise<RunAgentResult> {
  const agentTools = filterToolsForAgent(agentDef, allTools)
  const messages: MessageParam[] = [{ role: 'user', content: prompt }]
  const textParts: string[] = []

  const terminal = await query(messages, agentTools, (event) => {
    if (event.type === 'text_delta') textParts.push(event.text)
  }, {
    systemPrompt: options?.systemPrompt ?? agentDef.systemPrompt,
    model: options?.model,
    maxTokens: options?.maxTokens,
    maxTurns: options?.maxTurns,
  })

  return { result: textParts.join(''), terminal }
}
```

**为什么这只是一个函数调用，不是新类或进程？**

因为 `query()` 本身就是自包含的——它接收 `messages`、`tools`、`onEvent`，不依赖任何全局状态。创建一个子 Agent 就是：

1. 过滤工具 → 创建一个新的工具列表
2. 创建消息 → 一个新的 `{ role: 'user', content: prompt }`
3. 调用 query() → 独立的循环，独立的消息历史
4. 收集结果 → text_delta 事件被 collector 捕获

这就是"函数式隔离"：**不需要进程边界、不需要类实例、不需要上下文管理器——纯函数的参数隔离就够了。**

在 claude-code 中，`runAgent()` 有 960 行，因为要处理：
- MCP 服务器的子进程管理
- ToolUseContext 的深度克隆
- Permission 系统的 context 传递
- Async 模式的 task 注册
- SubagentStart/SubagentFinish hooks

mini-cc 把这些全部去掉，只保留核心：**filter → query → collect**。

### 模式 4：AgentTool — 暴露给模型的外部接口

```typescript
export const agentTool: Tool = buildTool({
  name: 'AgentTool',
  description: `创建一个子 Agent ...`,
  input_schema: {
    properties: {
      subagent_type: { enum: ['general', 'explore', 'plan'] },
      prompt: { type: 'string' },
    },
    required: ['prompt'],
  },
  async call(input): Promise<string> {
    const subagentType = (input.subagent_type as AgentType) || 'general'
    const agentDef = getAgentDefinition(subagentType)
    const { result, terminal } = await runAgent(prompt, agentDef, allTools)
    // ...
    return result
  },
})
```

**AgentTool 本身就是一个 Tool。** 没有特殊的状态、没有后台线程、没有事件监听。模型通过 `AgentTool({ subagent_type: "explore", prompt: "研究这个项目的结构" })` 来调用——跟调 `read_file`、`bash` 没有任何区别。

这个设计的精妙之处：**子 Agent 系统没有引入任何新的接口范式。Tool 就是唯一的接入点。**

### allTools 引用的注入问题

AgentTool 需要访问"当前注册的全部工具"来做过滤，但它在注册时还不知道最终的工具列表（MCP 工具可能在之后才注册）。解决方案：

```typescript
let allTools: Tool[] = []

export function setAllTools(tools: Tool[]): void {
  allTools = tools
}
```

CLI 启动时：
```typescript
registerAgentTool(toolRegistry)
// ... MCP tools registered ...
finalizeTools(toolRegistry)   // → setAllTools(registry.getAll())
```

这是一个"写时复制"模式的简化版——先注册 AgentTool，等所有工具就绪后再设置引用。在 claude-code 中这个问题的解法更复杂：
- `runAgent()` 在创建子 Agent 时通过 `assembleToolPool()` 从头组装工具池
- 工具池来自 `ToolUseContext`，它持有完整的 `ToolRegistry`
- 不需要全局引用，每次执行时动态解析

mini-cc 的全局引用方案虽然不如 claude-code 的依赖注入优雅，但在单注册表架构下足够简单。

## 实现要点

### 注册流程

Subagent 在 runtime 启动时也会经历两层注册，但它和 Skill 的关键区别是：**AgentDefinition 不会注册成 Command**。

```
createRuntime()
  └─ createToolset(systemPrompt)
      ├─ new AgentRegistry(BUILT_IN_AGENTS)
      ├─ loadAgentsFromDir()
      │   └─ AGENT.md -> AgentDefinition
      ├─ agentRegistry.register(agent)
      └─ registerAgentTool()
          └─ Tool(name: "AgentTool")
```

第一步是 **注册成 AgentDefinition**。

`loadAgentsFromDir()` 读取 `~/.mini-cc/agents/<dir>/AGENT.md`，产出：

```typescript
{
  name,
  description,
  whenToUse,
  systemPrompt,
  allowedToolNames,
}
```

这些定义进入 `AgentRegistry`，和内置的 `general` / `explore` / `plan` 放在同一个注册表里。它们不会进入 `CommandRegistry`，所以用户不能通过 `/explore ...` 直接执行。

第二步是 **注册成 tool**。

`registerAgentTool()` 不会把每个 agent 注册成一个独立 tool，而是只注册一个统一入口：

```typescript
Tool name: AgentTool
```

这个 `AgentTool` 的 description 会把所有可用 Agent 类型拼进去：

```text
创建一个子 Agent 独立执行任务。可用 Agent 类型：
- general: 通用 Agent，可使用全部工具执行任意编码任务（适用场景：...）
- explore: 只读探索 Agent，搜索代码、查阅文档、理解项目结构 [工具限制：read_file, web_search]
- plan: 可读写文件（无 bash）的规划 Agent [工具限制：read_file, write_file, edit_file]
```

模型看到的是一个稳定 tool schema，加上一段动态 agent 列表。调用时的 tool 名始终是：

```typescript
AgentTool({ subagent_type: "explore", prompt: "..." })
```

在 claude-code 原版里，这个工具的正式名字是 `Agent`，旧 wire name 是 `Task`。mini-cc 当前叫 `AgentTool`，是为了学习阶段更直观地区分它和普通 Agent Loop。

### 执行流程

Subagent 当前只有模型侧执行入口，没有 slash command 主动执行入口。

第一种是 **模型主动委派：调用 AgentTool**。

```text
模型看到 Tool(name: "AgentTool") 的 description
  -> 判断任务适合交给某个子 Agent
  -> tool_use: AgentTool({ subagent_type: "explore", prompt: "查一下 SkillTool 流程" })
  -> AgentTool 从 AgentRegistry.get("explore")
  -> filterToolsForAgent(agentDef, allTools)
  -> runAgent(prompt, agentDef, filteredTools)
  -> 子 Agent 独立 query loop 运行
  -> 返回文本结果给父 Agent
```

第二种是 **用户间接触发：用自然语言要求主 Agent 委派**。

```text
用户输入：用 explore agent 查一下 SkillTool 怎么注册
  -> 主 Agent 理解用户意图
  -> 主 Agent 仍然需要调用 AgentTool(...)
```

这不是硬语法，而是模型决策。mini-cc 目前没有 `/agent explore ...` 这种直接执行命令。按照 claude-code 的思路，`/agents` 更适合作为管理入口，用来创建、编辑、查看 agent 配置；真正执行仍然通过模型调用 `Agent`/`AgentTool`。

所以一句话总结：

```text
Subagent 先是 AgentRegistry 里的 AgentDefinition，
再通过一个统一的 AgentTool 暴露给模型执行。
```

### Happy Path

```
模型决定使用 AgentTool
│
▼
AgentTool.call({ subagent_type: "explore", prompt: "..." })  ← 工具执行阶段
│
├─ 1. getAgentDefinition("explore") → EXPLORE_AGENT
├─ 2. filterToolsForAgent(explore, allTools)
│      → [read_file, web_search, web_fetch]  (去掉 AgentTool + 只保留只读)
├─ 3. messages = [{ role: "user", content: prompt }]
├─ 4. query(messages, filteredTools, collector, { systemPrompt })
│      │
│      ▼  (子 Agent 独立循环)
│   子 Agent 探索代码、查阅文档...
│   collector 捕获 text_delta 事件
│      │
│      ▼
├─ 5. query() 返回 { reason: 'done' }
│
▼
AgentTool 返回子 Agent 的输出文本
```

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 子 Agent 出错 | `terminal.reason === 'error'` → 返回 `[子 Agent 错误] ${error}\n${result}` |
| `subagent_type` 不传 | 默认 `'general'`（全工具） |
| 对应的工具不存在 | `allowedToolNames` 中的工具名在注册表中找不到 → 被过滤掉，不报错 |
| 子 Agent 达到 maxTurns | parent 拿到 `reason: 'max_turns'` 和已有结果文本，正常返回 |
| `allTools` 包含 AgentTool 自身 | 过滤阶段被排除，子 Agent 看不到它 |
| `allTools` 未设置（空数组） | 子 Agent 的工具列表为空，Query 仍然可以运行（只是没有工具可用） |

### 防递归如何工作

```
父 Agent 的工具列表: [read_file, bash, AgentTool, Skill, ...]
                            ▲
                            │  ？调 AgentTool
                            │
子 Agent 的工具列表: [read_file, bash, ...]  (AgentTool 被过滤)
                            ▲
                            │  ！没有 AgentTool 可调
                            │
子 Agent 的子 Agent:        ✗ 不存在
```

这就是硬过滤——不是靠提示词约束，而是直接不把 AgentTool 放入子 Agent 的工具列表。模型要调 AgentTool，工具列表里根本没有它。

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/coordinator/types.ts` | `packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.ts` (`AgentDefinition`) | mini-cc 只有 3 个硬编码类型；claude-code 支持从文件系统加载自定义 Agent、MCP server spec、hooks、model override 等 20+ 字段 |
| `src/coordinator/agents.ts` | `packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts` | claude-code 支持更多内置类型（statusline-setup、coordinator worker 等），且有 coordinator-mode 切换逻辑 |
| `src/coordinator/toolFilter.ts` | `packages/builtin-tools/src/tools/AgentTool/agentToolUtils.ts` (`filterToolsForAgent`) | claude-code 还处理 permission mode、isAsync、isMainThread 等额外维度 |
| `src/coordinator/runAgent.ts` | `packages/builtin-tools/src/tools/AgentTool/runAgent.ts` | **最大差异**。claude-code 的 runAgent 有 960 行，处理 MCP 子进程管理、ToolUseContext 克隆、hooks、task 注册、流式事件转发等。mini-cc 只有 ~40 行，就是一个过滤→query→收集的管道 |
| `src/services/tools/agent.ts` | `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` | claude-code 的 AgentTool 有异步模式、fork 模式、MCP server 验证、权限集成、使用量上报等。mini-cc 只实现 sync 模式，返回纯文本 |
| (无) | `packages/builtin-tools/src/tools/AgentTool/AgentToolResult.tsx` | claude-code 有丰富的 result renderer（同步/异步/通知等），mini-cc 只返回字符串 |
| (无) | `src/coordinator/coordinatorMode.ts` + `workerAgent.ts` | claude-code 有完整的 coordinator-worker 模式，mini-cc 未实现 |

### 关键简化

1. **无 async/background 模式** — claude-code 的 AgentTool 支持 `run_in_background: true`（子 Agent 注册为 task，parent 继续工作），mini-cc 只有 sync 模式
2. **无 ToolUseContext** — claude-code 通过 `ToolUseContext` 传递完整的工具池、权限上下文、MCP 客户端等；mini-cc 用一个全局 `allTools` 引用解决
3. **无 MCP 隔离** — claude-code 为子 Agent 启动独立的 MCP 客户端；mini-cc 只共享（不隔离）MCP 工具
4. **无 hooks/permissions** — claude-code 有 `SubagentStart`/`SubagentFinish` hooks 和 permission 集成；mini-cc 还没有权限系统

## 设计教训

1. **query() 的自包含设计让子 Agent 几乎"免费"** — 因为 `query()` 接收全部参数、不依赖全局状态，创建一个子 Agent 就是调一次函数。如果 `query()` 依赖了全局的 `messages`、`tools`、或其他可变状态，子 Agent 系统会复杂得多。**函数式核心 + 命令式外壳**是一个强有力的架构模式。

2. **Tool 接口足够表达"启动一个 Agent"** — AgentTool 没有引入任何新范式，它就是一个普通的 Tool。这意味着模型不需要学习任何新概念——"调工具"已经是它最熟练的操作了。**不要为"特殊操作"发明新机制，用已有的抽象去表达。**

3. **防递归是基础设施问题，不是提示词问题** — 不要在 system prompt 里写"不要调 AgentTool"，而是直接把它从工具列表里拿掉。模型不会调用它看不到的工具。**安全约束用代码实施，不用提示词建议。**

4. **claude-code 的 AgentTool 复杂在生态集成，不在核心逻辑** — 核心逻辑（filter → query → result）在 mini-cc 中不到 50 行。那 1500 多行的差异来自 MCP 管理、权限系统、任务系统、事件流、通知机制等"生态集成"。这说明：**AgentTool 的核心是一个简单的模式，但把它嵌入一个生产级系统需要大量的集成代码。** mini-cc 抓住了骨架，跳过了集成细节——这是正确的学习路径。

5. **Sync 模式是"子 Agent 作为工具结果"** — 子 Agent 的输出通过 tool_result 返回给父 Agent，父 Agent 看到的是"一段文本"，跟 read_file 的返回没有本质区别。这个视角很有用：**子 Agent 本质上是一个计算密集型、有自主决策能力的"工具"**——它跟 `bash("find . -name '*.ts'")` 的区别只是"bash 执行 shell 命令，AgentTool 执行一个 Agent 循环"。

---

*本教程由 mini-cc 项目在完成第 5 课后自动生成。*
