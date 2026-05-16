// 内置命令提供最小可用示例：它们和文件命令走同一套 prompt command 协议。

import type { Command } from './types.js'
import { substituteArguments } from './arguments.js'

function makeBuiltinCommand(command: {
  name: string
  description: string
  content: string
  allowedTools?: string[]
  argumentNames?: string[]
}): Command {
  // 内置命令也包装成 PromptCommand，避免 CLI 为 builtin/file command 分叉。
  return {
    type: 'prompt',
    name: command.name,
    description: command.description,
    source: 'builtin',
    allowedTools: command.allowedTools,
    argumentNames: command.argumentNames,
    contentLength: command.content.length,
    async getPromptForCommand(args: string) {
      // 和文件命令共用参数替换规则，保证 /review 与用户自定义命令行为一致。
      return substituteArguments(command.content, args, command.argumentNames)
    },
  }
}

export const BUILT_IN_COMMANDS: Command[] = [
  makeBuiltinCommand({
    name: 'review',
    description: '审查当前改动，优先指出 bug、风险和缺失测试',
    allowedTools: ['read_file', 'bash'],
    content: [
      '请审查当前仓库改动。',
      '',
      '要求：',
      '- 优先列出 bug、行为回归、风险和缺失测试',
      '- 用文件和行号定位问题',
      '- 如果没有发现问题，明确说明剩余风险',
      '',
      '$ARGUMENTS',
    ].join('\n'),
  }),
  makeBuiltinCommand({
    name: 'explain',
    description: '解释指定代码或概念，聚焦设计意图和关键路径',
    allowedTools: ['read_file'],
    argumentNames: ['topic'],
    content: [
      '请解释 $topic。',
      '',
      '要求：',
      '- 先说明它解决什么问题',
      '- 再说明关键控制流和主要类型',
      '- 如果涉及代码，请引用具体文件',
    ].join('\n'),
  }),
]
