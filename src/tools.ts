// 工具池：装配所有内置工具到注册中心
// Agent 初始化时调一次，拿到完整的 ToolRegistry

import { ToolRegistry } from './services/tools/registry.js'
import { readFileTool } from './services/tools/read_file.js'
import { writeFileTool } from './services/tools/write_file.js'
import { editFileTool } from './services/tools/edit_file.js'
import { bashTool } from './services/tools/bash.js'
import { webSearchTool } from './services/tools/web_search.js'
import { webFetchTool } from './services/tools/web_fetch.js'

export function createDefaultTools(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(editFileTool)
  registry.register(bashTool)
  registry.register(webSearchTool)
  registry.register(webFetchTool)
  return registry
}
