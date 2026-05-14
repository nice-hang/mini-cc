// Skill Tool：模型通过此工具发现和加载 Skill
//
// 本质：tool description 中列出所有可用 skill（name + description + whenToUse），
// 模型匹配到场景后调用 Skill({skill: "name"}) 获取完整指令
//
// 不注入 system prompt，零固定 token 开销
//
// 参考 claude-code：packages/builtin-tools/src/tools/SkillTool/

import { buildTool } from '../../Tool.js'
import type { Skill } from '../../skills/types.js'

function buildSkillListing(skills: Skill[]): string {
  if (skills.length === 0) return ''

  return skills.map(s => {
    let line = `- /${s.name}: ${s.description}`
    if (s.whenToUse) line += `（适用场景：${s.whenToUse}）`
    if (s.allowedTools && s.allowedTools.length > 0) {
      line += ` [工具限制：${s.allowedTools.join(', ')}]`
    }
    return line
  }).join('\n')
}

export function createSkillTool(skills: Skill[]) {
  const listing = buildSkillListing(skills)

  return buildTool({
    name: 'Skill',
    description: listing
      ? `按名加载并执行 Skill。可用 Skill：\n${listing}`
      : '按名加载并执行 Skill。当前没有可用 Skill。',

    input_schema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill 名称，如 "example"' },
        args: { type: 'string', description: '可选参数，传给 Skill 的 $ARGUMENTS' },
      },
      required: ['skill'],
    },

    async call(input: Record<string, unknown>): Promise<string> {
      const name = input.skill as string
      const args = input.args as string | undefined
      const skill = skills.find(s => s.name === name)
      if (!skill) return `错误：未找到 Skill "${name}"`

      let content = skill.content

      // 替换 ${CLAUDE_SKILL_DIR} 为 skill 所在目录
      if (skill.baseDir) {
        content = content.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skill.baseDir)
      }

      // 替换 $ARGUMENTS 为传入的参数
      if (args !== undefined) {
        content = content.replace(/\$ARGUMENTS/g, args)

        // 按参数名替换：$1, $2 等对应 argumentNames 中的位置
        if (skill.argumentNames && args) {
          const argParts = args.split(/\s+/)
          for (let i = 0; i < skill.argumentNames.length; i++) {
            const val = argParts[i] || ''
            content = content.replace(
              new RegExp(`\\$\\{${skill.argumentNames[i]}\\}`, 'g'),
              val,
            )
          }
        }
      }

      return `--- /${name} ---\n${content}\n---`
    },

    // Skill 调用本身无副作用，但需按序执行
    isConcurrencySafe: () => true,
    interruptBehavior: () => 'cancel',
  })
}
