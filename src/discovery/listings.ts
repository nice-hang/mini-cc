// Discovery Listing：动态能力列表属于会话上下文，不属于稳定的 Tool schema。

import type { Tool } from '../Tool.js'
import type { Attachment } from '../attachments/types.js'
import type { CommandRegistry } from '../commands/registry.js'
import type { AgentRegistry } from '../coordinator/agents.js'
import type { AgentDefinition } from '../coordinator/types.js'
import { filterToolsForAgent } from '../coordinator/toolFilter.js'
import { TOOL_SEARCH_TOOL_NAME, formatDeferredToolLine, isDeferredTool } from '../services/tools/tool_search.js'

const SKILL_CHAR_BUDGET = 8_000
const MAX_LISTING_DESC_CHARS = 250

export type DiscoveryListingOptions = {
  commandRegistry: CommandRegistry
  agentRegistry: AgentRegistry
  tools: Tool[]
}

export function buildDiscoveryAttachments(options: DiscoveryListingOptions): Attachment[] {
  const attachments: Attachment[] = []

  if (hasTool(options.tools, 'Skill')) {
    const skillListing = buildSkillListing(options.commandRegistry)
    if (skillListing.content) {
      attachments.push(skillListing)
    }
  }

  if (hasTool(options.tools, 'AgentTool')) {
    const agentListing = buildAgentListingDelta(options.agentRegistry, options.tools)
    if (agentListing.addedLines.length > 0 || agentListing.removedTypes.length > 0) {
      attachments.push(agentListing)
    }
  }

  if (hasTool(options.tools, TOOL_SEARCH_TOOL_NAME)) {
    const deferredTools = options.tools.filter(isDeferredTool)
    if (deferredTools.length > 0) {
      attachments.push({
        type: 'deferred_tools_delta',
        addedNames: deferredTools.map(tool => tool.name).sort(),
        addedLines: deferredTools.map(formatDeferredToolLine).sort(),
        removedNames: [],
        isInitial: true,
      })
    }
  }

  return attachments
}

export function buildSkillListing(commandRegistry: CommandRegistry): Extract<Attachment, { type: 'skill_listing' }> {
  const skills = commandRegistry
    .getAll()
    .filter(command => command.kind === 'skill')
    .map(command => {
      const description = command.whenToUse
        ? `${command.description} - ${command.whenToUse}`
        : command.description
      return `- ${command.name}: ${truncate(description, MAX_LISTING_DESC_CHARS)}`
    })

  return {
    type: 'skill_listing',
    content: fitWithinBudget(skills, SKILL_CHAR_BUDGET),
    skillCount: skills.length,
    isInitial: true,
  }
}

export function buildAgentListingDelta(
  agentRegistry: AgentRegistry,
  tools: Tool[],
): Extract<Attachment, { type: 'agent_listing_delta' }> {
  const agents = agentRegistry.getAll()
  const addedLines = agents.map(agent => {
    return `- ${agent.name}: ${agent.whenToUse || agent.description} (Tools: ${formatAgentTools(agent, tools)})`
  })

  return {
    type: 'agent_listing_delta',
    addedTypes: agents.map(agent => agent.name),
    addedLines,
    removedTypes: [],
    isInitial: true,
  }
}

function formatAgentTools(agent: AgentDefinition, tools: Tool[]): string {
  const agentTools = filterToolsForAgent(agent, tools)
  if (agentTools.length === 0) return 'None'
  return agentTools.map(tool => tool.name).join(', ')
}

function fitWithinBudget(lines: string[], budget: number): string {
  if (lines.length === 0) return ''

  const full = lines.join('\n')
  if (full.length <= budget) return full

  const nameOnlyLines = lines.map(line => {
    const colonIndex = line.indexOf(':')
    return colonIndex === -1 ? line : line.slice(0, colonIndex)
  })
  const nameOnly = nameOnlyLines.join('\n')
  if (nameOnly.length <= budget) return nameOnly

  const result: string[] = []
  let used = 0
  for (const line of nameOnlyLines) {
    const nextUsed = used + line.length + (result.length > 0 ? 1 : 0)
    if (nextUsed > budget) break
    result.push(line)
    used = nextUsed
  }
  return result.join('\n')
}

function hasTool(tools: Tool[], name: string): boolean {
  return tools.some(tool => tool.name === name)
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}
