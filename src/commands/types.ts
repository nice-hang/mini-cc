// Command 是可复用的 prompt 模板：用户用 /name 调用，系统把它展开成普通用户消息。

export type CommandSource = 'builtin' | 'user' | 'skill'

export interface PromptCommand {
  type: 'prompt'
  name: string
  description: string
  source: CommandSource
  kind?: 'skill'
  // 先作为 metadata 保留；真正的硬权限会在 Permission 课接入。
  allowedTools?: string[]
  argumentNames?: string[]
  whenToUse?: string
  context?: 'inline' | 'fork'
  contentLength: number
  // 调用时生成 prompt，给参数替换、后续 shell block / plugin 变量预留扩展点。
  getPromptForCommand(args: string): Promise<string>
}

export type Command = PromptCommand

export interface CommandInvocation {
  commandName: string
  args: string
}
