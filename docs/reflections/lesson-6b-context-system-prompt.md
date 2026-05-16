# 第 6B 课：Context / System Prompt

> 本教程是 mini-cc 系列的第 6B 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 6B 课。
> 代码实现见 `src/context.ts`、`src/cli/runtime.ts`、`src/services/tools/agent.ts`，参考源码为 claude-code 的 `../claude-code/src/context.ts`、`../claude-code/src/constants/prompts.ts`、`../claude-code/src/QueryEngine.ts`。

---

## 本质

> Context 是 Agent 看世界的方式。System prompt 承载稳定规则和项目现场，messages 承载用户请求和对话历史。

```
createRuntime()
  ├─ buildSystemPrompt()
  │   ├─ 基础身份和工具原则
  │   ├─ cwd / date / platform
  │   ├─ AGENTS.md / CLAUDE.md
  │   └─ git branch / status / diff stat
  │
  └─ runOnce()
      └─ query(messages, tools, { systemPrompt })
```

核心思想：**工具给 Agent 行动能力，Context 给 Agent 判断边界。**

## 为什么需要它

前几课里，mini-cc 虽然能调工具，但模型并不知道项目规则：

- 不知道当前仓库的课程节奏
- 不知道编码规范要求中文注释
- 不知道 cwd、日期、平台
- 不知道当前 git 分支和工作区状态
- 子 Agent 也只知道自己的角色，不知道项目现场

这会让 Agent 像“有手但没眼睛”。6B 的目标就是把项目现场整理成 system prompt，让主 Agent 和子 Agent 都从同一份上下文出发。

## 设计意图

- **生命周期先拆开**：先实现 `createRuntime()` / `runOnce()`，让初始化和单次执行分离。
- **稳定信息进 system**：身份、工具原则、项目指令、cwd/git/date 都属于稳定上下文。
- **用户请求仍进 messages**：普通输入和 slash command 展开内容仍然是 user message。
- **子 Agent 继承 Context**：子 Agent 保留自己的角色提示，同时继承父级项目现场。

mini-cc 暂时不做 prompt caching、compact、memory。先把输入边界和 prompt 边界立住，后续模块才有地方接。

## 关键模式

### 模式 1：Runtime 生命周期

```typescript
export async function createRuntime(options): Promise<CliRuntime> {
  const systemPrompt = await buildSystemPrompt()
  const commandRegistry = await createCommandRegistry()
  const tools = await createToolset(systemPrompt)
  return { ...options, systemPrompt, commandRegistry, tools }
}

export async function runOnce(runtime, input, onText) {
  const commandResult = await expandCommandIfNeeded(runtime.commandRegistry, input)
  const messages = [{ role: 'user', content: commandResult.userContent }]
  return query(messages, runtime.tools, onEvent, {
    systemPrompt: runtime.systemPrompt,
  })
}
```

**为什么先做这个重构？**

Context 是 runtime 级别的东西，不是某条用户输入的局部变量。先拆 `createRuntime()`，后面加 memory、settings、plugin refresh、REPL 时都不用再把 `index.ts` 搅成一锅汤。

### 模式 2：System Prompt Builder

```typescript
export async function buildSystemPrompt(cwd = process.cwd()): Promise<string> {
  const context = {
    cwd,
    date: new Date().toISOString().slice(0, 10),
    platform: process.platform,
    projectInstructions: await loadProjectInstructions(cwd),
    git: await loadGitContext(cwd),
  }
  return renderSystemPrompt(context)
}
```

**为什么用 builder，而不是在 CLI 里拼字符串？**

system prompt 会越来越复杂。把读取项目文件、git 摘要、环境信息和渲染逻辑集中到 `src/context.ts`，可以让 CLI 只负责生命周期，不负责上下文细节。

### 模式 3：子 Agent 继承父 Context

```typescript
function buildSubagentSystemPrompt(agentSystemPrompt, parentSystemPrompt) {
  return [
    parentSystemPrompt,
    '## 子 Agent 指令',
    agentSystemPrompt,
  ].join('\n\n')
}
```

**为什么父 Context 在前、子 Agent 指令在后？**

父 Context 是项目现场，子 Agent 指令是角色收束。放在后面能让 explore / plan / general 的职责边界更靠近最终指令位置。

## 实现要点

### Happy Path

1. `createRuntime()` 调 `buildSystemPrompt()`。
2. `buildSystemPrompt()` 读取 `AGENTS.md` / `CLAUDE.md`，并收集 cwd/date/platform/git。
3. `runOnce()` 调 `query()` 时传 `systemPrompt`。
4. API 层按 provider 发送：
   - Anthropic：顶层 `system`
   - OpenAI 兼容：`messages.unshift({ role: 'system', ... })`
5. AgentTool 创建子 Agent 时把父级 system prompt 和子 Agent system prompt 合并。

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 没有 `AGENTS.md` / `CLAUDE.md` | 项目指令段落省略 |
| 非 git 仓库 | Git 上下文省略 |
| git 命令失败或超时 | 降级为空，不阻断启动 |
| diff 很大 | 只取 `git diff --stat`，不塞完整 diff |
| 子 Agent | 继承父 Context，再追加自己的角色指令 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/context.ts` | `src/context.ts` + `constants/prompts.ts` | mini-cc 只保留基础身份、项目文件和 git 摘要 |
| `src/cli/runtime.ts` | `QueryEngine.ts` + REPL 启动流程 | mini-cc 是单次 CLI，但已经拆出 runtime 生命周期 |
| `query(..., { systemPrompt })` | QueryEngine 构造 API 请求 | mini-cc 直接透传 system prompt |
| `buildSubagentSystemPrompt()` | AgentTool / coordinator context 传递 | mini-cc 用字符串合并，官方还会传权限、hooks、MCP、session 等上下文 |

## 学到的设计教训

1. **Context 是 runtime 资产，不是输入字符串** — 它应该在启动时构建，在每次 query 时注入。
2. **System 和 User 要分层** — 项目规则放 system，用户请求放 messages，slash command 展开仍然是 user message。
3. **子 Agent 不能只继承工具** — 它也要继承项目现场，否则会在干净上下文里丢掉仓库规则。

---

*本教程由 mini-cc 项目在完成第 6B 课后自动生成。*
