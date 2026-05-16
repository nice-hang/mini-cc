// 工具池：装配所有内置工具到注册中心
// Agent 初始化时调一次，拿到完整的 ToolRegistry
//
// 也提供 MCP 工具注册方法，把外部 MCP 服务器发现到的工具注入注册中心

import { ToolRegistry } from './services/tools/registry.js'
import { readFileTool } from './services/tools/read_file.js'
import { writeFileTool } from './services/tools/write_file.js'
import { editFileTool } from './services/tools/edit_file.js'
import { bashTool } from './services/tools/bash.js'
import { webSearchTool } from './services/tools/web_search.js'
import { webFetchTool } from './services/tools/web_fetch.js'
import type { McpClient } from './services/mcp/client.js'
import type { Skill } from './skills/types.js'
import { createSkillTool } from './services/tools/skill.js'
import { createAgentTool, updateAllTools } from './services/tools/agent.js'
import type { AgentRegistry } from './coordinator/agents.js'

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

// 从一个已连接的 MCP Client 发现工具并注册到 registry
// 工具名自动添加 mcp__serverName__ 前缀防止命名冲突
export async function registerMcpTools(
  registry: ToolRegistry,
  client: McpClient,
  serverName: string,
): Promise<number> {
  const tools = await client.listTools()
  for (const tool of tools) {
    registry.register(client.toMiniCCTool(tool, serverName))
  }
  return tools.length
}

// 注册 Skill Tool：把已加载的 skill 列表包装成一个工具暴露给模型
// 模型通过 Skill({skill: "name"}) 获取 skill 完整指令
export function registerSkillTool(
  registry: ToolRegistry,
  skills: Skill[],
): void {
  if (skills.length === 0) return
  registry.register(createSkillTool(skills))
}

// 注册 AgentTool：把 agent 注册表中的所有 Agent 包装成一个工具暴露给模型
// 模型通过 AgentTool({ subagent_type: "explore", prompt: "..." }) 启动子 Agent
export function registerAgentTool(
  registry: ToolRegistry,
  agentRegistry: AgentRegistry,
  parentSystemPrompt?: string,
): void {
  registry.register(createAgentTool(agentRegistry, { parentSystemPrompt }))
}

// 在全部工具注册完成后调用，建立 AgentTool 所需的全局工具引用
// AgentTool 用它来做工具过滤（防递归 + 类型限制）
export function finalizeTools(registry: ToolRegistry): void {
  updateAllTools(registry.getAll())
}
