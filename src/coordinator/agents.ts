// Agent 注册中心 + 内置 Agent 定义
//
// 两种来源：内置定义（代码注册）+ 文件装载（loader.ts 扫描目录）
// 统一注册到 AgentRegistry，AgentTool 从中查询和列出

import type { AgentDefinition } from './types.js'

// ─── 内置 Agent ───────────────────────────────────────────────────

export const GENERAL_PURPOSE_AGENT: AgentDefinition = {
  name: 'general',
  description: '通用 Agent，可使用全部工具执行任意编码任务',
  whenToUse: '需要完成编码任务、执行命令、修改文件等通用场景',
  systemPrompt:
    `你是一个通用编码助手（General Agent）。
你可以使用所有可用工具来协助用户完成任务。
请专注于高效、准确地完成被指派的任务。`,
  allowedToolNames: [],
}

export const EXPLORE_AGENT: AgentDefinition = {
  name: 'explore',
  description: '只读探索 Agent，搜索代码、查阅文档、理解项目结构',
  whenToUse: '需要搜索代码、阅读文件、了解项目结构、查阅文档时',
  systemPrompt:
    `你是一个只读的探索 Agent（Explore Agent）。
你只能读取文件、搜索代码和网页——不能修改任何文件或执行命令。
请专注于理解和收集信息，高效地回答用户的问题。`,
  allowedToolNames: ['read_file', 'web_search', 'web_fetch', 'glob', 'grep'],
}

export const PLAN_AGENT: AgentDefinition = {
  name: 'plan',
  description: '可读写文件（无 bash）的规划 Agent',
  whenToUse: '需要制定方案、编写代码、编辑文件时',
  systemPrompt:
    `你是一个规划 Agent（Plan Agent）。
你可以读取和写入文件来制定方案和实现代码。
请仔细分析需求，制定清晰的计划，然后逐步实施。`,
  allowedToolNames: ['read_file', 'write_file', 'edit_file', 'glob', 'grep'],
}

export const BUILT_IN_AGENTS: AgentDefinition[] = [
  GENERAL_PURPOSE_AGENT,
  EXPLORE_AGENT,
  PLAN_AGENT,
]

// ─── AgentRegistry ────────────────────────────────────────────────
// 统一管理所有 Agent（内置 + 文件装载），支持按名查找

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>()

  constructor(defs?: AgentDefinition[]) {
    if (defs) defs.forEach(a => this.register(a))
  }

  register(def: AgentDefinition): void {
    this.agents.set(def.name, def)
  }

  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name)
  }

  getAll(): AgentDefinition[] {
    return [...this.agents.values()]
  }
}
