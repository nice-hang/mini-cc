// ToolSearch：MCP 工具已在 runtime 注册，但完整 schema 通过 message delta 暴露给模型。

import { buildTool, type Tool } from '../../Tool.js'
import type { Attachment } from '../../attachments/types.js'

export const TOOL_SEARCH_TOOL_NAME = 'ToolSearch'

let pendingSchemaDelta: Extract<Attachment, { type: 'deferred_tool_schema_delta' }> | undefined

export function isDeferredTool(tool: Tool): boolean {
  if (tool.alwaysLoad === true) return false
  return tool.isMcp === true
}

export function formatDeferredToolLine(tool: Tool): string {
  return tool.name
}

export function getVisibleToolsForRequest(tools: Tool[]): Tool[] {
  return tools.filter(tool => {
    if (tool.name === TOOL_SEARCH_TOOL_NAME) return true
    if (!isDeferredTool(tool)) return true
    return false
  })
}

export function consumeDeferredToolSchemaDelta(): Extract<Attachment, { type: 'deferred_tool_schema_delta' }> | undefined {
  const delta = pendingSchemaDelta
  pendingSchemaDelta = undefined
  return delta
}

export function createToolSearchTool(getTools: () => Tool[]): Tool {
  return buildTool({
    name: TOOL_SEARCH_TOOL_NAME,
    description: [
      'Search and load deferred tool schemas.',
      'Use this before calling an MCP tool that is listed as deferred but not yet available.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords to search, or select:<tool_name>[,<tool_name>] to load exact tools.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matching tools to load.',
        },
      },
      required: ['query'],
    },
    isConcurrencySafe: () => true,
    interruptBehavior: () => 'cancel',
    call: async (input) => {
      const query = String(input.query ?? '').trim()
      const maxResults = Number(input.max_results ?? 5)
      const tools = getTools()
      const deferredTools = tools.filter(isDeferredTool)
      const matches = findDeferredTools(query, deferredTools, Number.isFinite(maxResults) ? maxResults : 5)

      if (matches.length === 0) {
        return [
          `No matching deferred tools found for: ${query}`,
          `Total deferred tools: ${deferredTools.length}`,
        ].join('\n')
      }

      pendingSchemaDelta = {
        type: 'deferred_tool_schema_delta',
        addedNames: matches.map(tool => tool.name),
        schemaLines: matches.map(renderToolSchema),
      }

      return [
        'Loaded deferred tool schemas.',
        'A deferred_tool_schema_delta system-reminder will be appended to the next model turn.',
      ].join('\n')
    },
  })
}

function findDeferredTools(query: string, tools: Tool[], maxResults: number): Tool[] {
  const select = query.match(/^select:(.+)$/i)
  if (select) {
    const requested = select[1]
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
    return requested
      .map(name => tools.find(tool => tool.name === name))
      .filter((tool): tool is Tool => Boolean(tool))
      .slice(0, maxResults)
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean)

  if (terms.length === 0) return []

  return tools
    .map(tool => ({ tool, score: scoreTool(tool, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.tool)
}

function scoreTool(tool: Tool, terms: string[]): number {
  const name = tool.name.toLowerCase()
  const description = tool.description.toLowerCase()
  const hint = tool.searchHint?.toLowerCase() ?? ''
  let score = 0

  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (hint.includes(term)) score += 4
    if (description.includes(term)) score += 2
  }

  return score
}

function renderToolSchema(tool: Tool): string {
  return JSON.stringify({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  })
}
