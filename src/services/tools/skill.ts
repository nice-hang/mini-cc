// Skill Tool：模型通过此工具加载 Skill
//
// 本质：Tool schema 保持稳定；可用 skill 列表由 discovery attachment 注入。
// 模型匹配到场景后调用 Skill({skill: "name"}) 获取完整指令。
//
// 参考 claude-code：packages/builtin-tools/src/tools/SkillTool/

import { buildTool } from '../../Tool.js'
import type { CommandRegistry } from '../../commands/registry.js'

export function createSkillTool(commandRegistry: CommandRegistry) {
  return buildTool({
    name: 'Skill',
    description: [
      '按名加载并执行 Skill。',
      '可用 Skill 会在对话中的 <system-reminder> 里列出；当任务匹配某个 Skill 时，先调用此工具加载完整指令。',
      '不要在未调用此工具的情况下声称已经使用了某个 Skill。',
    ].join('\n'),

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
