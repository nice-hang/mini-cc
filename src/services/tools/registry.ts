// Tool 注册中心：name → Tool 的 Map
// 支持运行时动态注册 / 注销，供 query loop 和执行引擎使用

import type { Tool } from '../../Tool.js'

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }

  get size(): number {
    return this.tools.size
  }
}
