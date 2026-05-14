# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-15

**当前阶段**：Phase 1 第 5 课 — Subagent 系统（未开始）

**上节课完成**：第 4 课 — Skill 系统（全部 3 个 Step + Tutorial 完成）

**关键决策**：
- Skill 不走 system prompt 注入，改为 Skill Tool 的 description 字段暴露 — 零固定 token 开销，模型决定调 tool 时才读到技能列表
- Skill frontmatter 用纯 regex 解析，不引入 yaml 库
- Skill 目录固定为 `~/.mini-cc/skills/<name>/SKILL.md`
- 无 skill 时 Skill Tool 不注册，零开销
- Variable substitution: `${CLAUDE_SKILL_DIR}` → skill baseDir, `$ARGUMENTS` → args 参数, `${name}` → 命名参数
- Allowed-tools 过滤：`query.ts` 中追踪 `activeSkillName`，在调用模型前过滤 tools 数组；Skill 工具本身始终可用，方便模型切换 skill；过滤作用于模型可见的工具列表，执行层仍使用全量工具索引

**设计理由（对比 system prompt 注入方案）**：
- System prompt 注入：有 skill 就固定占 token，信息与 Skill Tool 描述重复
- Skill Tool description：无 skill 零开销，单一数据源，模型主动发现（同 claude-code 设计）

**已完成**（Step 1 ~ Step 3）：
- `src/skills/types.ts` — Skill 接口定义
- `src/skills/loader.ts` — 目录扫描 + frontmatter 解析
- `src/services/tools/skill.ts` — Skill Tool（description 列表 + call 加载 + 变量替换）
- `src/skills/index.ts` — 公开 API
- `src/tools.ts` — 新增 `registerSkillTool()` 辅助函数
- `src/cli/index.ts` — 启动时加载 skills → 注册 Skill Tool
- `~/.mini-cc/skills/example/SKILL.md` — 示例 skill
- `src/query/query.ts` — 激活 skill 后按 allowed-tools 过滤工具列表（Skill 工具本身始终可用）

**尝试过但排除的方案**：
- System prompt 注入技能列表 → Skill Tool description 更简洁，零固定 token 开销
- yaml 库解析 frontmatter → 纯 regex 就够了
- `injector.ts` → 已删除，不再需要

**下一步**：
第 5 课 — Subagent 系统：AgentTool 创建独立子 Agent

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 4 课 — Skill 系统（`src/skills/`）

- [x] Step 1：Skill 发现 — 目录扫描 + frontmatter 解析
- [x] Step 2：Skill Tool — tool description 曝露 skill 列表，call 返回完整指令（含变量替换）
- [x] Step 3：Skill 限制 — allowed-tools 过滤工具集
- [x] **Tutorial** → `docs/reflections/lesson-4-skill-system.md`

**参考源码**：
- `deps/claude-code/src/skills/loadSkillsDir.ts` — 目录扫描 + 去重
- `deps/claude-code/src/skills/bundledSkills.ts` — createSkillCommand
- `deps/claude-code/packages/builtin-tools/src/tools/SkillTool/` — Skill Tool
