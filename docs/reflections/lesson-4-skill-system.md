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
    └──────────────────────────────┘
              │
              │ 模型调用 Skill("name")
              ▼
    ┌──────────────────────────────┐
    │  完整指令注入对话上下文        │
    │  + allowed-tools 过滤工具集   │
    └──────────────────────────────┘
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
- **安全边界** — `allowed-tools` 白名单控制 skill 激活后能调哪些工具，防止模型在 skill 上下文中误用危险工具

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

### 模式 4：Allowed-Tools 过滤 — 工具权限控制

skill 激活后，`query.ts` 在每轮循环开始时检查 `activeSkillName`：

```typescript
let currentAllowedTools: string[] | null = null
if (activeSkillName) {
  const activeSkill = skills?.find(s => s.name === activeSkillName)
  if (activeSkill?.allowedTools?.length) {
    currentAllowedTools = activeSkill.allowedTools
  }
}

const modelTools = currentAllowedTools
  ? tools?.filter(t => currentAllowedTools.includes(t.name) || t.name === 'Skill')
  : tools
```

- 只过滤**发送给模型**的工具列表（模型看不到不能用的工具）
- 执行层仍用全量工具索引（防止同一轮内混合调用的查找错误）
- Skill 工具本身始终保留，方便模型切换 skill
- 无 active skill 时不做任何过滤

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
       │
       ▼
  后续工具调用受 allowed-tools 约束
```

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| `~/.mini-cc/skills/` 不存在 | `loadSkillsFromDir` 返回空数组，不报错 |
| 目录下没有 SKILL.md | 跳过该目录，继续扫描 |
| frontmatter 不完整/格式错误 | 返回空 frontmatter，用目录名当 skill 名 |
| `allowed_tools` 未定义 | 不做任何过滤，所有工具可用 |
| `allowed_tools: []` | 同上，视为未定义（无限制） |
| 无 skill 注册 | Skill Tool 不注册，零工具开销 |
| 找不到 skill | 返回错误消息 `错误：未找到 Skill "name"` |
| 变量名不匹配 | 保留原文不变，不替换 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/skills/types.ts` | `src/skills/bundledSkills.ts` (`Command` type) | mini-cc 合并了 frontmatter 字段到 Skill 接口，claude-code 把 Command 和 Skill 分开定义 |
| `src/skills/loader.ts` | `src/skills/loadSkillsDir.ts` | claude-code 支持多级目录、黑名单、去重等，mini-cc 只支持 `*/SKILL.md` 扁平结构 |
| `src/services/tools/skill.ts` | `packages/builtin-tools/src/tools/SkillTool/` | claude-code 使用 Context API 设置 active skill、用 `formatCommandsWithinBudget()` 做预算截断；mini-cc 直接拼接 description |
| `src/query/query.ts` (activeSkillName) | `packages/builtin-tools/src/tools/SkillTool/SkillTool.ts` | claude-code 通过 `ctx.setActiveSkill()` 持久化到 Context；mini-cc 在 query 循环中用局部变量追踪 |

**主要简化**：

- **Budget 控制**：claude-code 的 `SKILL_BUDGET_CONTEXT_PERCENT = 1%` 用 context window 的 1% 做 skill 描述预算，超了要截断。mini-cc 直接全量放 description 里——因为当前只有几个 skill，远不会超
- **Attachment 注入**：claude-code 会把 skill listing 作为 conversation attachments 增量更新，实现"无感刷新"。mini-cc 的 Skill Tool description 在启动时一次性构建，不支持动态更新
- **去重逻辑**：claude-code 处理同名 skill 取最长 description。mini-cc 不做去重，后加载的覆盖先加载的

## 学到的设计教训

1. **工具的 description 是零成本的"广告位"** — Skill 系统最优雅的一点是它没有引入任何新机制，只是把 skill 清单放到了 Tool description 里。模型读 tool 列表时顺带看到了技能。千万不要为了"曝露信息"而专门写一段系统 prompt。

2. **让模型主动获取，不要推送** — System prompt 推送的信息占用的是"租金"（每轮都付）。Skill Tool 拉取的信息是"按需购买"（用时才付费）。Agent 系统里，能让模型主动拿的就别塞给它。

3. **白名单比黑名单安全** — `allowed-tools` 定义的是"能做什么"而不是"不能做什么"。白名单有默认拒绝的特性：新加的工具不会自动暴露给所有 skill，需要 skill 作者显式声明。这个模式也用在 subagent 系统里（explore 只读、plan 读+写）。

4. **Frontmatter 够用就行** — 一开始想引入 yaml 库解析 frontmatter，后来发现 flat key:value + 列表就够了。纯 regex 解析省了一个依赖、零学习成本。SKILL.md 是给人写的，不是给机器写的——够简单才有人写。

---

*本教程由 mini-cc 项目在完成第 4 课后自动生成。*
