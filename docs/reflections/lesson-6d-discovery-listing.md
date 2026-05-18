# 第 6D 课：Discovery Prompt / Listing 注入

> 本教程是 mini-cc 系列的第 6D 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 6D 课。
> 代码实现见 `src/attachments/`、`src/discovery/listings.ts`、`src/query/query.ts`、`src/services/tools/skill.ts`、`src/services/tools/agent.ts`、`src/cli/runtime.ts`，参考源码为 claude-code 的 `../claude-code/packages/builtin-tools/src/tools/SkillTool/prompt.ts`、`../claude-code/packages/builtin-tools/src/tools/AgentTool/prompt.ts`、`../claude-code/src/utils/attachments.ts`。

---

## 本质

> Skill / Agent 列表是动态发现结果，不是 Tool schema 的一部分。

```
CommandRegistry / AgentRegistry
  └─ discovery listing
      └─ Attachment(skill_listing / agent_listing_delta)
          └─ render as <system-reminder>
              └─ query request

Tool schema
  └─ stable description
```

核心思想：**Tool description 负责说明工具怎么用，Attachment 负责结构化管理当前有哪些可选项。**

## 为什么需要它

6C 之后，Skill 已经迁移到 Command 模型，但 `Skill` tool 仍然把所有 skill 列表拼进 description。AgentTool 也一样，把所有 agent 类型拼进 description。

这能跑通 happy path，但真实运行会有三个问题：

- 列表越长，首轮上下文越重。
- Plugin refresh、MCP 连接、权限变化都会改变列表，从而改变 tool schema。
- 子 Agent 的工具集和父 Agent 不一样，如果复用父级 description，模型会看到自己不能调用的能力。

Claude Code 的方向是把动态列表移出工具定义：Skill 列表通过 `skill_listing` 注入，Agent 列表通过 `agent_listing_delta` 注入。mini-cc 也保留这层 attachment 语义，只是在 API 发送前把 attachment 渲染成 `<system-reminder>` user message。

## 设计意图

- **稳定 schema**：`Skill` 和 `AgentTool` 的 description 不再包含动态列表。
- **结构化注入**：先构造 `Attachment`，再由 renderer 转成 Claude Messages 能承载的 user message。
- **按需注入**：只有当前工具池里有 `Skill`，才注入 `skill_listing`；只有有 `AgentTool`，才注入 `agent_listing_delta`。
- **列表预算**：skill listing 默认最多 8000 chars，单条说明最多 250 chars。
- **能力一致**：agent listing 展示的是过滤后的有效工具，而不是 frontmatter 里原始 allowlist。
- **子 Agent 隔离**：子 Agent 只收到自己工具池对应的 listing；由于子 Agent 默认看不到 `AgentTool`，不会再看到 agent 列表。

## 关键模式

### 模式 1：稳定 Tool Description

```typescript
export function createSkillTool(commandRegistry: CommandRegistry) {
  return buildTool({
    name: 'Skill',
    description: [
      '按名加载并执行 Skill。',
      '可用 Skill 会在对话中的 <system-reminder> 里列出。',
    ].join('\n'),
    async call(input) {
      const command = commandRegistry.get(name)
      return command.getPromptForCommand(args)
    },
  })
}
```

**为什么这样设计？**

工具定义进入模型的 tool schema，应该尽量稳定。真正会变的是列表，不是工具能力本身。

### 模式 2：Attachment 作为中间层

```typescript
export type Attachment =
  | { type: 'skill_listing'; content: string; skillCount: number; isInitial: boolean }
  | { type: 'agent_listing_delta'; addedLines: string[]; removedTypes: string[]; isInitial: boolean }

export function buildDiscoveryAttachments(options: DiscoveryListingOptions): Attachment[] {
  if (hasTool(options.tools, 'Skill')) {
    attachments.push(buildSkillListing(options.commandRegistry))
  }
  if (hasTool(options.tools, 'AgentTool')) {
    attachments.push(buildAgentListingDelta(options.agentRegistry, options.tools))
  }
  return attachments
}
```

**为什么按工具池判断？**

模型只应该看到它能行动的能力。如果当前 agent 没有 `AgentTool`，告诉它有哪些 subagent 只会制造无效选择。

### 模式 3：请求时渲染 Attachment

```typescript
const requestMessages = withAttachments(messages, options.attachments)
await streamMessage(requestMessages, tools, onEvent, ...)
```

**为什么不写入历史？**

这些 listing 是当前 runtime 状态，不是用户对话事实。Attachment 请求时临时渲染，物理上由 user message 承载，但不会污染长期消息历史。

## 实现要点

### Happy Path

```
createRuntime()
  ├─ CommandRegistry 加载 skills
  ├─ AgentRegistry 加载 agents
  ├─ ToolRegistry 注册稳定的 Skill / AgentTool
  └─ runOnce()
      ├─ buildDiscoveryAttachments()
      └─ query(attachments)
```

子 Agent 路径：

```
AgentTool.call()
  ├─ filterToolsForAgent()
  ├─ buildDiscoveryAttachments(tools: agentTools)
  └─ runAgent(attachments)
```

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 没有 Skill tool | 不注入 skill listing |
| 没有 AgentTool | 不注入 agent listing |
| skill 列表过长 | 单条先截断到 250 chars，再按 8000 chars 总预算裁剪 |
| 子 Agent 没有 AgentTool | 不会看到 agent listing |
| agent 工具限制 | listing 展示 `filterToolsForAgent()` 后的有效工具 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/attachments/types.ts` | `src/utils/attachments.ts` | mini-cc 只保留 `skill_listing` / `agent_listing_delta` 两种 attachment |
| `src/attachments/render.ts` | `src/utils/attachments.ts` | mini-cc 把 attachment 渲染成 `<system-reminder>` user message |
| `src/discovery/listings.ts` | `SkillTool/prompt.ts` | mini-cc 保留 8000 chars / 250 chars 的核心预算，暂不接 context window 动态计算 |
| `src/services/tools/agent.ts` | `AgentTool/prompt.ts` | mini-cc 先用 initial `agent_listing_delta` 全量宣布，暂不做 transcript diff |
| `src/coordinator/toolFilter.ts` | `AgentTool/loadAgentsDir.ts` / permission filter | mini-cc 只按已有 allowlist 过滤，不接 permission / MCP required server |

## 学到的设计教训

1. **可发现性不是工具定义** — 列表是动态状态，工具 schema 是稳定契约。
2. **父子 Agent 的上下文不能偷懒复用** — 子 Agent 的工具池变了，listing 也必须跟着变。
3. **Plugin 前要先拆边界** — Plugin refresh 会改变组件列表；先把 listing 移出 description，后面注册插件才不会牵动工具 schema。

---

*本教程由 mini-cc 项目在完成第 6D 课后自动生成。*
