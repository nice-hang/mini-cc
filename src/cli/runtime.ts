// CLI Runtime：把“能力初始化”和“处理一次输入”拆开，为后续 Context 注入预留边界。

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import pc from 'picocolors'
import { homedir } from 'os'
import { join } from 'path'
import type { Tool } from '../Tool.js'
import { buildSystemPrompt } from '../context.js'
import { query, type Terminal } from '../query/query.js'
import {
  createDefaultTools,
  registerMcpTools,
  registerSkillTool,
  registerAgentTool,
  finalizeTools,
} from '../tools.js'
import { AgentRegistry, BUILT_IN_AGENTS } from '../coordinator/agents.js'
import { loadAgentsFromDir } from '../coordinator/loader.js'
import { McpClient } from '../services/mcp/index.js'
import { loadSkillsFromDir } from '../skills/index.js'
import { buildDiscoveryAttachments } from '../discovery/listings.js'
import {
  BUILT_IN_COMMANDS,
  CommandRegistry,
  loadCommandsFromDir,
  parseCommandInvocation,
} from '../commands/index.js'

interface McpServerEntry {
  name: string
  url: string
  headers?: Record<string, string>
}

export interface CliRuntime {
  model: string
  maxTokens: number
  maxTurns: number
  systemPrompt: string
  commandRegistry: CommandRegistry
  agentRegistry: AgentRegistry
  tools: Tool[]
}

export type RuntimeOptions = {
  model: string
  maxTokens: number
  maxTurns: number
}

export type RunOnceResult =
  | { type: 'terminal'; terminal: Terminal }
  | { type: 'unknown_command'; commandName: string; availableCommands: string[] }

export async function createRuntime(options: RuntimeOptions): Promise<CliRuntime> {
  const systemPrompt = await buildSystemPrompt()
  const commandRegistry = await createCommandRegistry()
  const { tools, agentRegistry } = await createToolset(systemPrompt, commandRegistry)

  console.error(pc.dim(`Model: ${options.model}  Tools: ${tools.length}`))

  return {
    model: options.model,
    maxTokens: options.maxTokens,
    maxTurns: options.maxTurns,
    systemPrompt,
    commandRegistry,
    agentRegistry,
    tools,
  }
}

export async function runOnce(
  runtime: CliRuntime,
  input: string,
  onText: (text: string) => void,
): Promise<RunOnceResult> {
  const commandResult = await expandCommandIfNeeded(runtime.commandRegistry, input)
  if (commandResult.type === 'unknown_command') return commandResult

  const messages: MessageParam[] = [{ role: 'user', content: commandResult.userContent }]
  const attachments = buildDiscoveryAttachments({
    commandRegistry: runtime.commandRegistry,
    agentRegistry: runtime.agentRegistry,
    tools: runtime.tools,
  })

  const terminal = await query(messages, runtime.tools, (event) => {
    if (event.type === 'text_delta') onText(event.text)
  }, {
    model: runtime.model,
    maxTokens: runtime.maxTokens,
    maxTurns: runtime.maxTurns,
    systemPrompt: runtime.systemPrompt,
    attachments,
  })

  return { type: 'terminal', terminal }
}

async function createCommandRegistry(): Promise<CommandRegistry> {
  const commandRegistry = new CommandRegistry(BUILT_IN_COMMANDS)
  const commandsDir = process.env.COMMANDS_DIR || join(homedir(), '.mini-cc', 'commands')
  const fileCommands = await loadCommandsFromDir(commandsDir)
  fileCommands.forEach(command => commandRegistry.register(command))

  const skillsDir = process.env.SKILLS_DIR || join(homedir(), '.mini-cc', 'skills')
  const skillCommands = await loadSkillsFromDir(skillsDir)
  skillCommands.forEach(command => commandRegistry.register(command))

  if (fileCommands.length > 0) {
    console.error(pc.dim(`Commands: ${fileCommands.map(c => `/${c.name}`).join(', ')}`))
  }
  if (skillCommands.length > 0) {
    console.error(pc.dim(`Skills: ${skillCommands.map(s => s.name).join(', ')}`))
  }

  return commandRegistry
}

// 装配工具，Skill、Agent、MCP
async function createToolset(
  systemPrompt: string,
  commandRegistry: CommandRegistry,
): Promise<{ tools: Tool[]; agentRegistry: AgentRegistry }> {
  const toolRegistry = createDefaultTools()

  // Skill / Agent / MCP 都属于 runtime 能力，启动时装配一次，单次输入只负责消费。
  registerSkillTool(toolRegistry, commandRegistry)

  const agentsDir = process.env.AGENTS_DIR || join(homedir(), '.mini-cc', 'agents')
  const agentRegistry = new AgentRegistry(BUILT_IN_AGENTS)
  const fileAgents = await loadAgentsFromDir(agentsDir)
  fileAgents.forEach(agent => agentRegistry.register(agent))
  registerAgentTool(toolRegistry, agentRegistry, commandRegistry, systemPrompt)
  if (fileAgents.length > 0) {
    console.error(pc.dim(`Agents: ${fileAgents.map(a => a.name).join(', ')}`))
  }

  await registerConfiguredMcpTools(toolRegistry)

  finalizeTools(toolRegistry)
  return { tools: toolRegistry.getAll(), agentRegistry }
}

// 装配MCP
async function registerConfiguredMcpTools(toolRegistry: ReturnType<typeof createDefaultTools>): Promise<void> {
  const mcpServersJson = process.env.MCP_SERVERS
  if (!mcpServersJson) return

  let servers: McpServerEntry[]
  try {
    servers = JSON.parse(mcpServersJson) as McpServerEntry[]
  } catch (e) {
    console.error(pc.red(`MCP_SERVERS parse error: ${(e as Error).message}`))
    return
  }

  for (const srv of servers) {
    console.error(pc.dim(`MCP: discovering tools from ${srv.name} (${srv.url})`))
    const client = new McpClient()
    try {
      await client.connect(srv.name, { url: srv.url, headers: srv.headers })
      const count = await registerMcpTools(toolRegistry, client, srv.name)
      console.error(pc.dim(`MCP: ${srv.name} → ${count} tools`))
    } catch (e) {
      console.error(pc.red(`MCP: ${srv.name} failed: ${(e as Error).message}`))
    }
  }
}

async function expandCommandIfNeeded(
  commandRegistry: CommandRegistry,
  input: string,
): Promise<
  | { type: 'input'; userContent: string }
  | { type: 'unknown_command'; commandName: string; availableCommands: string[] }
> {
  const invocation = parseCommandInvocation(input)
  if (!invocation) return { type: 'input', userContent: input }

  const command = commandRegistry.get(invocation.commandName)
  if (!command) {
    return {
      type: 'unknown_command',
      commandName: invocation.commandName,
      availableCommands: commandRegistry.getAll().map(c => `/${c.name}`),
    }
  }

  console.error(pc.dim(`Command: /${command.name} (${command.source})`))
  return {
    type: 'input',
    userContent: await command.getPromptForCommand(invocation.args),
  }
}
