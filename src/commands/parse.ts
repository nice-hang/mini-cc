// Slash command 只在输入首行以 /name 开头时触发，普通斜杠文本不改变语义。

import type { CommandInvocation } from './types.js'

export function parseCommandInvocation(input: string): CommandInvocation | null {
  const trimmed = input.trimStart()
  // 必须整段输入匹配 /name，避免把普通文本里的路径或 URL 误判为 slash command。
  const match = trimmed.match(/^\/([A-Za-z0-9][A-Za-z0-9:_-]*)(?:\s+([\s\S]*))?$/)
  if (!match) return null

  return {
    commandName: match[1]!,
    args: match[2]?.trim() ?? '',
  }
}
