// 工具过滤：按子 Agent 类型限制可用工具
//
// 两层过滤：
// 1. 防递归 — 任何子 Agent 都看不到 AgentTool
// 2. 类型限制 — explore 只有只读工具，plan 有读写，general 全部放行

import type { Tool } from '../Tool.js'
import type { AgentDefinition } from './types.js'

const PARENT_ONLY_TOOLS = new Set(['AgentTool'])

export function filterToolsForAgent(
  agentDef: AgentDefinition,
  allTools: Tool[],
): Tool[] {
  return allTools.filter((tool) => {
    // 1. 防递归：AgentTool 只有父 Agent 能用
    if (PARENT_ONLY_TOOLS.has(tool.name)) return false

    // 2. 空名单 = 不限制（放行全部剩余工具）
    if (agentDef.allowedToolNames.length === 0) return true

    // 3. 否则只保留名单里的
    return agentDef.allowedToolNames.includes(tool.name)
  })
}
