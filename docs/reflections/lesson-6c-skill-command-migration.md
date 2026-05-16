# 第 6C 课：Skill → Command 迁移

> 本教程是 mini-cc 系列的第 6C 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 6C 课。
> 代码实现见 `src/skills/loader.ts`、`src/commands/types.ts`、`src/services/tools/skill.ts`、`src/cli/runtime.ts`，参考源码为 claude-code 的 `../claude-code/src/skills/loadSkillsDir.ts`、`../claude-code/packages/builtin-tools/src/tools/SkillTool/SkillTool.ts`、`../claude-code/src/types/command.ts`。

---

## 本质

> Skill 不是另一套并行的 prompt 系统，而是 Command 的一种来源。

```
SKILL.md
  └─ loadSkillsFromDir()
      └─ CommandRegistry(kind: "skill")
          ├─ /skill-name 直接作为 slash command 调用
          └─ Skill tool 按 name 冷加载完整 prompt
```

核心思想：**Skill 负责提供专家指令，CommandRegistry 负责统一发现、替换参数和调用入口。**

## 为什么需要它

第 4 课的 Skill 系统能跑通，但它和第 6A 课的 Command 系统是两套并行结构：

- Slash command 从 `CommandRegistry` 查找。
- SkillTool 从独立 `Skill[]` 查找。
- 参数替换逻辑在 command 和 skill tool 里各写一份。
- 后续 Plugin 如果同时贡献 commands 和 skills，会被迫接两条注册路径。

Claude Code 的真实边界更清楚：Skill loader 读取 `SKILL.md` 后创建 prompt command，SkillTool 再从 command 列表里执行它。6C 的目标就是把 mini-cc 也改到这条线上。

## 设计意图

- **删除中间模型**：不再保留独立 `Skill` 类型，loader 直接产出 `PromptCommand`。
- **loader 就是边界**：`src/skills/loader.ts` 读取 `~/.mini-cc/skills/*/SKILL.md`，并创建 `kind: "skill"` 的 command。
- **统一注册**：runtime 启动时把 skill command 注册进 `CommandRegistry`。
- **SkillTool 只查 registry**：模型调用 SkillTool 时，不再持有独立 `Skill[]`。
- **保留官方文件形态**：继续使用 `skills/<name>/SKILL.md`，但不保留第 4 课的独立 Skill 运行时模型。

这个迁移让第 7 课 Plugin 系统更自然：Plugin 只需要贡献组件，commands / skills 都能进入同一个 registry。

## 关键模式

### 模式 1：Skill Loader 直接创建 Command

```typescript
export async function loadSkillsFromDir(skillsDir: string): Promise<Command[]> {
  const raw = await readFile(skillFilePath, 'utf-8')
  const { frontmatter, content: markdown } = parseFrontmatter(raw)

  return {
    type: 'prompt',
    name: entry,
    kind: 'skill',
    source: 'skill',
    description: String(frontmatter.description),
    whenToUse: frontmatter.when_to_use,
    async getPromptForCommand(args) {
      let prompt = substituteArguments(markdown, args, argumentNames)
      return prompt.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
    },
  }
}
```

**为什么这样设计？**

`SKILL.md` 是文件格式，`Command` 是运行时结构。让 loader 直接返回 `Command[]`，可以删掉第 4 课留下的独立 `Skill` 模型，调用链也更贴近 claude-code 的 `createSkillCommand()`。

### 模式 2：Registry 是 SkillTool 的数据源

```typescript
function getSkillCommands(commandRegistry: CommandRegistry): Command[] {
  return commandRegistry.getAll().filter(command => command.kind === 'skill')
}

export function createSkillTool(commandRegistry: CommandRegistry) {
  const listing = buildSkillListing(getSkillCommands(commandRegistry))
  // call() 时再 command.getPromptForCommand(args)
}
```

**为什么不直接把所有 command 暴露给 SkillTool？**

mini-cc 当前阶段只迁移 Skill，不改变 slash command 的语义。`kind: "skill"` 是一个简单边界：SkillTool 只能执行 skill command，普通 `/review` 仍由用户 slash command 入口触发。

## 实现要点

### Happy Path

1. `loadSkillsFromDir()` 读取 `~/.mini-cc/skills/<dir>/SKILL.md`。
2. loader 直接返回 `Command`，命令名来自目录名，标记 `kind: "skill"`。
3. `createCommandRegistry()` 注册 built-in commands、文件 commands、skill commands。
4. `registerSkillTool()` 从 `CommandRegistry` 判断是否存在 skill command。
5. SkillTool 调用时执行 `command.getPromptForCommand(args)`，返回展开后的完整指令。

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 没有 skills 目录 | `loadSkillsFromDir()` 返回空数组，不注册 SkillTool |
| skill 名带 `/` 前缀 | SkillTool 调用时去掉前缀，兼容 `/demo` |
| 参数替换 | 复用 `substituteArguments()`，不在 SkillTool 里重复实现 |
| `${CLAUDE_SKILL_DIR}` | 在 skill command 的 `getPromptForCommand()` 阶段替换 |
| 普通 command | 不带 `kind: "skill"`，不会被 SkillTool 调用 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/skills/loader.ts` | `src/skills/loadSkillsDir.ts#createSkillCommand` | mini-cc 让 loader 直接创建 prompt command，只保留 name、description、allowedTools、whenToUse、context 和参数替换 |
| `Command.kind === "skill"` | `loadedFrom: "skills"` / command metadata | mini-cc 用更直白的 kind 标记 SkillTool 可执行范围 |
| `src/services/tools/skill.ts` | `packages/builtin-tools/src/tools/SkillTool/SkillTool.ts` | mini-cc 不做 forked skill、permission、hooks、telemetry，只做 prompt 展开 |
| `src/cli/runtime.ts` | `src/commands.ts` + runtime 初始化 | mini-cc 在 CLI runtime 里一次性装配 commands 和 skills |

## 学到的设计教训

1. **文件格式层不要泄漏成独立运行时模型** — `SKILL.md` 是来源，Command 才是 Agent 运行时真正消费的结构。
2. **贴近源码边界能删设计** — 当 claude-code 已经证明 Skill 是 prompt command，就不必保留一套并行 Skill 类型。
3. **统一 registry 会减少后续分叉** — Plugin、SkillTool、slash command 都能围绕 CommandRegistry 演进。

---

*本教程由 mini-cc 项目在完成第 6C 课后自动生成。*
