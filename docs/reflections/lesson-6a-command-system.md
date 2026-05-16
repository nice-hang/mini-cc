# 第 6A 课：Command 系统

> 本教程是 mini-cc 系列的第 6A 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 6A 课。
> 代码实现见 `src/commands/`，参考源码为 claude-code 的 `../claude-code/src/types/command.ts`、`../claude-code/src/commands.ts`、`../claude-code/src/skills/loadSkillsDir.ts`。

---

## 本质

> Command 是可命名、可复用的 prompt 单元。用户输入 `/name args`，Harness 把它展开成一段普通用户消息，再交给现有 Agent Loop。

```
stdin: /review src/query/query.ts
        │
        ▼
CommandRegistry.get("review")
        │
        ▼
getPromptForCommand(args)
        │
        ▼
messages = [{ role: "user", content: expandedPrompt }]
        │
        ▼
query(messages, tools)
```

Command 的关键价值不是“多一个命令行功能”，而是给 Skill 和 Plugin 提供统一的 prompt 组件模型。

## 为什么需要它

前 5 课里，mini-cc 已经有 SkillTool，但 Skill 是一个独立系统：`src/skills/` 自己扫描、自己解析、自己替换参数。对照 Claude Code 后会发现这个边界不够准确：

- Slash command 是 prompt command
- Skill 也是 prompt command 的一种来源
- Plugin command / plugin skill 也会进入 command 列表

如果没有 Command 层，后续 Plugin 就很容易被误建成“任意 Tool 注册器”。但 Claude Code 的 Plugin 更像扩展组件包，组件里很重要的一类就是 command/skill 这种 prompt 单元。

## 设计意图

- **统一入口**：内置命令、用户 markdown 命令先进入 `CommandRegistry`，调用方只按 name 查 command。
- **低上下文成本**：command 内容不常驻 system prompt，只有被 `/name` 调用时才展开。
- **保留工具意图**：`allowedTools` 先作为 metadata 保存，本课不做权限拦截，后续 hooks/permission 课再使用。
- **复用现有 Agent Loop**：command 不引入新的执行引擎，只产出用户消息，继续走 `query()`。

本课刻意只实现 prompt command，不做 local/UI command。Claude Code 的 `Command` union 很大，mini-cc 现在只需要最核心的 `PromptCommand`。

## 关键模式

### 模式 1：PromptCommand

```typescript
export interface PromptCommand {
  type: 'prompt'
  name: string
  description: string
  source: 'builtin' | 'user'
  allowedTools?: string[]
  argumentNames?: string[]
  contentLength: number
  getPromptForCommand(args: string): Promise<string>
}
```

**为什么 `getPromptForCommand` 是函数？**

因为 command 不是静态文本。它需要在调用时接收 args，替换 `$ARGUMENTS`、`$0`、`$name` 等占位符。Claude Code 里这个函数还会执行 shell prompt block、替换 plugin 变量、注入 session id；mini-cc 先保留函数边界，后续可以自然扩展。

### 模式 2：CommandRegistry

```typescript
export class CommandRegistry {
  private commands = new Map<string, Command>()

  register(command: Command): void
  get(name: string): Command | undefined
  getAll(): Command[]
}
```

Registry 的作用是把“命令来自哪里”从“命令怎么调用”里拆开。CLI 不关心 command 是内置的还是用户 markdown 文件加载出来的，只关心能不能通过 name 找到它。

### 模式 3：Markdown Loader

```markdown
---
description: Review current changes
arguments: target
allowed-tools: read_file, bash
---
Please review $target.

ARGUMENTS: $ARGUMENTS
```

loader 把 `~/.mini-cc/commands/*.md` 转成 `PromptCommand`：

- 文件名默认是 command name
- `description` 必填，否则不注册
- `arguments` 变成参数名列表
- `allowed-tools` 只记录，不执行权限控制
- markdown 正文在调用时做参数替换

## 实现要点

### Happy Path

1. CLI 读入 stdin。
2. 加载 `BUILT_IN_COMMANDS` 和 `~/.mini-cc/commands/*.md`。
3. 如果输入匹配 `/command args`，从 registry 查 command。
4. 调用 `getPromptForCommand(args)` 得到展开后的 prompt。
5. 用展开 prompt 构造首条 user message，进入现有 `query()`。

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| `~/.mini-cc/commands` 不存在 | 返回空列表，不报错 |
| markdown 没有 description | 跳过注册，避免把不可发现的命令暴露出去 |
| 未知 `/command` | CLI 报错并列出可用命令，不发送给模型 |
| command 正文没有占位符但用户传了 args | 追加 `ARGUMENTS: ...`，避免参数静默丢失 |
| `allowed-tools` | 本课只保存 metadata，权限课再接入硬约束 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/commands/types.ts` | `src/types/command.ts` | 只保留 `PromptCommand`，不实现 local / local-jsx / MCP command |
| `src/commands/registry.ts` | `src/commands.ts` | mini-cc 用显式 registry；Claude Code 聚合大量内置命令、skills、plugins |
| `src/commands/loader.ts` | `src/skills/loadSkillsDir.ts` + `utils/plugins/loadPluginCommands.ts` | 只支持 `~/.mini-cc/commands/*.md`，不递归、不执行 shell frontmatter |
| `src/commands/arguments.ts` | `utils/argumentSubstitution.ts` | 支持 `$ARGUMENTS`、`$0`、`$name`、`${name}`，shell parsing 做了简化 |
| `src/cli/index.ts` | CLI slash command 调用链 | mini-cc 在单次 stdin 模式下直接展开 command prompt |

## 学到的设计教训

1. **Command 是 Skill 和 Plugin 的前置抽象** — 先补 Command，后面迁移 Skill 和接 Plugin 才不会走偏。
2. **Prompt command 不需要新执行器** — 它的输出仍然是一条 user message，复用 Agent Loop 是最小正确实现。
3. **metadata 先保存，权限后接入** — `allowedTools` 现在不拦截，但保留字段能让后续 hooks/permission 自然接上。

---

*本教程由 mini-cc 项目在完成第 6A 课后自动生成。*
