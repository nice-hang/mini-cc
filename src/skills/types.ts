// Skill 定义：按需加载的专家指令
//
// 本质：system prompt 中只出现 name + description（占用固定小预算），
// 模型匹配到场景后调用 Skill 工具加载完整指令
//
// 参考 claude-code：src/skills/bundledSkills.ts Command type

export interface Skill {
  name: string
  description: string
  whenToUse?: string       // 提示模型什么场景命中这个 skill
  content: string          // 完整的 markdown 指令（不含 frontmatter）
  allowedTools?: string[]  // 该 skill 可用的工具白名单，空=无限制
  baseDir?: string         // SKILL.md 所在目录（用于 ${CLAUDE_SKILL_DIR} 替换）
  argumentNames?: string[] // 参数名，用于 ${argument} 替换
}
