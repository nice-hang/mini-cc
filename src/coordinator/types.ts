// Subagent 系统类型定义
//
// AgentDefinition 描述一个子 Agent 的身份和能力边界：
// - 类型（type）用于查找和调度
// - systemPrompt 定义子 Agent 的角色行为
// - allowedToolNames 限制可用工具（空=不限制，AgentTool 始终被排除）
//
// 与 Skill 系统一致：Agent 定义可以从文件装载（frontmatter + markdown 正文），
// 也可以内置在代码中注册

export type AgentDefinition = {
  name: string
  description: string
  whenToUse?: string            // 适用场景（用于 tool description）
  systemPrompt: string
  allowedToolNames: string[]
  // 文件装载时自动填充
  baseDir?: string
  filename?: string
}
