// CommandRegistry 统一内置命令和文件命令，调用方只需要按 name 查 prompt command。

import type { Command } from './types.js'

export class CommandRegistry {
  private commands = new Map<string, Command>()

  constructor(commands: Command[] = []) {
    for (const command of commands) {
      this.register(command)
    }
  }

  register(command: Command): void {
    // 同名 command 后注册者覆盖先注册者，给用户文件命令预留覆盖 builtin 的空间。
    this.commands.set(command.name, command)
  }

  get(name: string): Command | undefined {
    return this.commands.get(name)
  }

  getAll(): Command[] {
    // 稳定排序让错误提示和调试输出可预测。
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}
