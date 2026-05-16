// Skill Tool：模型通过此工具发现和加载 Skill
//
// 本质：tool description 中列出所有可用 skill（name + description + whenToUse），
// 模型匹配到场景后调用 Skill({skill: "name"}) 获取完整指令
//
// 不注入 system prompt，零固定 token 开销
//
// 参考 claude-code：packages/builtin-tools/src/tools/SkillTool/

import { buildTool } from '../../Tool.js'
import type { CommandRegistry } from '../../commands/registry.js'
import type { Command } from '../../commands/types.js'

function getSkillCommands(commandRegistry: CommandRegistry): Command[] {
  return commandRegistry.getAll().filter(command => command.kind === 'skill')
}

function buildSkillListing(skills: Command[]): string {
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

export function createSkillTool(commandRegistry: CommandRegistry) {
  const listing = buildSkillListing(getSkillCommands(commandRegistry))

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
      const rawName = input.skill as string
      const name = rawName.startsWith('/') ? rawName.slice(1) : rawName
      const args = input.args as string | undefined
      const command = commandRegistry.get(name)
      if (!command || command.kind !== 'skill') {
        return `错误：未找到 Skill "${name}"`
      }

      const content = await command.getPromptForCommand(args || '')
      return `--- /${name} ---\n${content}\n---`
    },

    // Skill 调用本身无副作用，但需按序执行
    isConcurrencySafe: () => true,
    interruptBehavior: () => 'cancel',
  })
}
