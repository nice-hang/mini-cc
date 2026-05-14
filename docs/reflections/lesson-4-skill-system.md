# 第 4 课：Skill 系统

> 本教程是 mini-cc 系列的第 4 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 4 课。
> 代码实现见 `src/skills/` + `src/services/tools/skill.ts`，参考源码为 claude-code 的 `deps/claude-code/src/skills/` + `packages/builtin-tools/src/tools/SkillTool/`。

---

## 本质

> Skill 系统是按需加载的专家指令机制。让 Agent 在不增加固定 token 开销的前提下，具备领域专业知识。

核心思想：**别把全部指令塞进 system prompt，让模型在需要时自己来取。**

```
                   ┌──────────────┐
                   │   Skill 目录   │
                   │  ~/.mini-cc/  │
                   │  skills/*/    │
                   │  SKILL.md     │
                   └──┬───────────┘
                      │ 扫描发现
                      ▼
    ┌──────────────────────────────┐
    │      Skill Tool              │
    │  description: 列出所有 skill  │  ← 零固定 token 开销
    │  call(name):  返回完整指令    │  ← 模型主动调用才加载
    └──────────────┬───────────────┘
                   │
                   │ 模型调用 Skill("name")
                   ▼
         ┌─────────────────┐
         │  两种执行模式     │
         ├─────────────────┤
         │ inline（默认）    │ → 内容注入对话，软约束
         │ fork             │ → 启动子 Agent 隔离执行
         └─────────────────┘
```

## 为什么需要它

没有 Skill 系统的 Agent 面临的困境：

**场景 1：全量注入**
```
system prompt = 通用指令 + Git 专家知识 + 测试规范 + 前端最佳实践 + 数据库调优指南 + ...
```
结果：上下文窗口被固定指令占满，能用的"有效空间"越来越少。不管你用不用 Git 知识，它都在那里。

**场景 2：无领域知识**
```
system prompt = 通用指令
```
结果：Agent 遇到特定领域任务（如 Git 操作、代码审查、性能分析）时没有专业知识，输出质量不稳定。

Skill 系统的解法：**把领域知识拆分到独立文件中，用工具接口暴露给模型。模型自己判断当前任务是否需要加载特定 skill——像人查手册一样，用的时候才翻开。**

## 设计意图

### 核心约束

- **零固定 token 开销** — 没有 skill 注入到 system prompt 中。模型只有在决定调用 Skill Tool 时才会读到 skill 列表的描述，不调用时完全零开销
- **渐进式披露** — 模型先看到 skill 的 name + description（通过 Tool description），决定用哪个后才加载完整指令。类比："书名 + 封面 → 翻到具体页"
- **可扩展** — skill 就是一个 markdown 文件 + frontmatter，任何人都能写。放在 `~/.mini-cc/skills/<name>/SKILL.md` 即可被自动发现
- **双执行模式** — `context: 'inline'`（默认）将 skill 内容注入当前对话；`context: 'fork'` 启动独立子 Agent 隔离执行

### Trade-off

| 方案 | 开销 | 冷启动 | 复杂度 |
|------|------|--------|--------|
| System prompt 全量注入 | 固定高 token 占用 | 无 | 低 |
| Skill Tool 按需加载 | 零固定开销 | 多一轮 tool call | 中 |
| Tool description 列表 | 极小（name+desc） | 无 | 低 |

mini-cc 采用混合方案：**Tool description 列 skill 清单（极小开销），模型按需加载完整指令（额外的 round-trip）**。这是在"上下文效率"和"响应速度"之间的权衡——大多数场景下，省下的 token 远多于多一轮调用的成本。

## 关键模式

### 模式 1：Skill 发现 — 目录扫描 + Frontmatter 解析

```
~/.mini-cc/skills/<name>/SKILL.md
                    └─── 目录名即 skill 名（可被 frontmatter 覆盖）
```

SKILL.md 用 frontmatter 描述元数据，正文是完整指令：

```markdown
---
name: example
description: 示例 Skill
when_to_use: 当用户想测试 skill 系统时
allowed_tools: [read_file, web_search]
context: inline          # inline（默认）| fork
arguments: [query, language]
---

# 指令正文

使用 ${CLAUDE_SKILL_DIR} 引用技能所在目录。
传递参数 ${query} 和 ${language}。
```

用纯 regex 解析 frontmatter（不引入 yaml 库），只支持 `key: value` 和 `key: [item1, item2]` 两种格式——足够用了，不增加依赖。

### 模式 2：Skill Tool — 工具化的指令加载

Skill 本身不是一个命令行指令，而是一个 **Tool**。模型看到的是一个名叫 `Skill` 的工具，就像看到 `read_file`、`bash` 一样：

```typescript
export function createSkillTool(skills: Skill[]) {
  return buildTool({
    name: 'Skill',
    description: listing
      ? `按名加载并执行 Skill。可用 Skill：\n${listing}`
      : '按名加载并执行 Skill。当前没有可用 Skill。',
    input_schema: {
      type: 'object',
      properties: {
        skill: { type: 'string' },
        args: { type: 'string', description: '可选参数，传给 $ARGUMENTS' },
      },
      required: ['skill'],
    },
    async call(input) { /* 查找 skill → 变量替换 → 返回指令 */ },
  })
}
```

**关键洞察**：Tool 的 `description` 字段就是发给模型的 API 参数。claude-code 把 skill 清单放进 description，相当于让模型在"决定调什么 tool"这一步就看到了可用技能。不额外占任何系统 prompt 空间。

### 模式 3：变量替换 — 动态参数注入

Skill 加载后做三步替换：

1. `${CLAUDE_SKILL_DIR}` → skill 文件所在目录的绝对路径（方便 skill 指令中引用同目录的其他文件）
2. `$ARGUMENTS` → 模型调用 Skill 时传入的原始 args 字符串
3. `${argumentName}` → 按 `argumentNames` 中的命名逐个替换（位置参数解析）

### 模式 4：Allowed-Tools — 软约束方案

这是本课最重要的设计纠正。**mini-cc 第一版错误地实现了硬过滤**（在 `query.ts` 中追踪 `activeSkillName`，砍掉模型看到的工具列表）。

claude-code 的实际做法完全不同：

**Inline 模式（默认）：**
- **不做工具过滤**。模型始终看到全部工具
- Skill 的 `allowed_tools` 通过 `contextModifier` 回调，添加到 `ToolUseContext` 的 `alwaysAllowRules`（权限自动批准规则）
- 约束是软性的：模型通过 skill 内容中的指令知道"该用什么工具"，但仍然可以调用其他工具（只是会触发权限提示）
- 没有"激活的 skill"状态概念——`contextModifier` 在 Skill Tool 返回时由 `StreamingToolExecutor` 应用，影响后续的权限决策

**Fork 模式：**
- 启动独立的子 Agent，通过 `createSubagentContext()` 创建隔离的执行环境
- `allowed_tools` 在子 Agent 中成为真正的工具白名单——子 Agent 的工具注册表只包含这些工具
- 这是真正的"硬隔离"，不共享上下文

**mini-cc 当前的做法（修正后）：**

既然 mini-cc 还没有权限系统（第 11 课），inline 模式的 allowed-tools 就作为**软约束**——只在 Skill Tool 的 `description` 中展示给模型（`[工具限制：read_file, web_search]`），模型按指令行事。`query.ts` 不做任何过滤，始终把全部工具发给模型。

```typescript
// 修正前：query.ts 中做硬过滤
let activeSkillName: string | null = null
// ... 每轮检查 activeSkill → 过滤 tools 数组 ...

// 修正后：query.ts 不感知 skill，工具列表不变
// 所有工具始终对模型可见
```

## 实现要点

### Happy Path

```
加载 Skill 目录 → 解析 SKILL.md frontmatter → 注册 Skill Tool
       │                                            │
       ▼                                            ▼
  模型看到 Tool description 中的 skill 列表 ←───────┘
       │
       ▼ (模型匹配到场景)
  调用 Skill("example", "args")
       │
       ▼
  查找 skill → 变量替换 → 返回完整指令
       │
       ▼
  指令出现在 tool_result 中 → 模型据此行动
```

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| `~/.mini-cc/skills/` 不存在 | `loadSkillsFromDir` 返回空数组，不报错 |
| 目录下没有 SKILL.md | 跳过该目录，继续扫描 |
| frontmatter 不完整/格式错误 | 返回空 frontmatter，用目录名当 skill 名 |
| `allowed_tools` 未定义 | description 中不显示工具限制 |
| `allowed_tools: []` | 同上，视为未定义 |
| 无 skill 注册 | Skill Tool 不注册，零工具开销 |
| 找不到 skill | 返回错误消息 `错误：未找到 Skill "name"` |
| 变量名不匹配 | 保留原文不变，不替换 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/skills/types.ts` | `src/skills/bundledSkills.ts` (`Command` type) | mini-cc 合并了 frontmatter 字段到 Skill 接口，claude-code 把 Command 和 Skill 分开定义 |
| `src/skills/loader.ts` | `src/skills/loadSkillsDir.ts` | claude-code 支持多级目录、黑名单、去重等，mini-cc 只支持 `*/SKILL.md` 扁平结构 |
| `src/services/tools/skill.ts` | `packages/builtin-tools/src/tools/SkillTool/` | claude-code 使用 `contextModifier` 回调修改 `ToolUseContext`（改 alwaysAllowRules/模型/effort）；mini-cc 只在 description 中展示软约束 |
| `src/query/query.ts` | `src/services/tools/StreamingToolExecutor.ts` | **关键差异**：mini-cc 第一版在 query.ts 中做了硬过滤（已撤回）。claude-code 的 inline 模式不做工具过滤，由 StreamToolExecutor 应用 contextModifier |
| (fork 模式) | `src/utils/forkedAgent.ts` | 未实现，依赖第 5 课 subagent 系统。claude-code 通过 `createSubagentContext()` + `runForkedAgent()` 执行 |

**设计教训（本课最重要的部分）：**

**没有先读 claude-code 源码就做设计决策，导致了方向性错误。**

第一版实现凭推测认为"allowed-tools 应该硬过滤工具列表"，在 `query.ts` 中引入了 `activeSkillName` 追踪和数组过滤。后来读了 claude-code 源码才发现：

1. claude-code 的 inline 模式不做工具过滤——改的是权限系统的 `alwaysAllowRules`
2. claude-code 没有 `setActiveSkill` 这个概念——用的是 `contextModifier` 回调
3. 真正的硬隔离发生在 fork 模式，通过子 Agent 实现

**这个错误的成本**：从设计到实现到文档，全部需要推翻重来。如果在动手前先读 10 分钟 claude-code 源码，完全可以避免。

## 设计教训

1. **工具的 description 是零成本的"广告位"** — Skill 系统最优雅的一点是它没有引入任何新机制，只是把 skill 清单放到了 Tool description 里。模型读 tool 列表时顺带看到了技能。千万不要为了"曝露信息"而专门写一段系统 prompt。

2. **让模型主动获取，不要推送** — System prompt 推送的信息占用的是"租金"（每轮都付）。Skill Tool 拉取的信息是"按需购买"（用时才付费）。Agent 系统里，能让模型主动拿的就别塞给它。

3. **先读源码，再下结论** — 本课最大的教训。`allowed-tools"硬过滤"` 是一个完全错误的推测。如果有疑问，`deps/claude-code/` 就在那里。读 10 分钟源码比花 1 小时实现错误方案然后重来更高效。

4. **软约束 vs 硬约束** — Inline 模式的约束天然应该是软的：你告诉模型该怎么做，它照做。硬约束（工具过滤、权限拦截）是有成本的系统机制，用在真正需要隔离的场景（fork 模式、subagent）。不要为软场景上硬手段。

5. **Frontmatter 够用就行** — 纯 regex 解析省了一个依赖、零学习成本。SKILL.md 是给人写的，不是给机器写的——够简单才有人写。

---

*本教程由 mini-cc 项目在完成第 4 课后自动生成。*
