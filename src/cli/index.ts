// CLI 入口：单次模式（stdin → Agent → stdout）
//
// 使用方式：
//   echo "What is in package.json?" | npm run dev
//   npm run dev < input.txt
//
// MCP 服务器：通过 MCP_SERVERS 环境变量配置（JSON 数组，HTTP 地址）
//   export MCP_SERVERS='[{"name":"fs","url":"http://localhost:3100/mcp"}]' && echo "..." | npm run dev

import { config as loadEnv } from 'dotenv'
import pc from 'picocolors'
loadEnv()
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { query } from '../query/query.js'
import { readStdin } from './readline.js'
import { createDefaultTools, registerMcpTools, registerSkillTool, registerAgentTool, finalizeTools } from '../tools.js'
import { AgentRegistry, BUILT_IN_AGENTS } from '../coordinator/agents.js'
import { loadAgentsFromDir } from '../coordinator/loader.js'
import { McpClient } from '../services/mcp/index.js'
import { loadSkillsFromDir } from '../skills/index.js'
import {
  BUILT_IN_COMMANDS,
  CommandRegistry,
  loadCommandsFromDir,
  parseCommandInvocation,
} from '../commands/index.js'
import { homedir } from 'os'
import { join } from 'path'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-flash'
const MAX_TOKENS = 4096
const MAX_TURNS = 25

interface McpServerEntry {
  name: string
  url: string
  headers?: Record<string, string>
}

async function main() {
  // 检查 API key
  const needsOpenAI = MODEL.startsWith('deepseek-') || MODEL.startsWith('qwen-')
  const hasKey = needsOpenAI
    ? process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
    : process.env.ANTHROPIC_API_KEY
  if (!hasKey) {
    console.error(pc.red('Error: missing API key'))
    console.error(pc.dim(`Provider: ${needsOpenAI ? 'OpenAI-compatible' : 'Anthropic'}`))
    console.error(pc.dim(`Set ${needsOpenAI ? 'OPENAI_API_KEY or ' : ''}ANTHROPIC_API_KEY in .env`))
    process.exit(1)
  }

  // 读入用户输入
  const input = await readStdin()
  if (!input) {
    console.error(pc.dim('Pipe input: echo "your question" | npm run dev'))
    process.exit(1)
  }

  // ── Command 系统 ───────────────────────────────────────────────
  // slash command 是 prompt 模板：先展开成普通用户消息，再进入 query loop
  const commandRegistry = new CommandRegistry(BUILT_IN_COMMANDS)
  const commandsDir = process.env.COMMANDS_DIR || join(homedir(), '.mini-cc', 'commands')
  const fileCommands = await loadCommandsFromDir(commandsDir)
  fileCommands.forEach(command => commandRegistry.register(command))
  if (fileCommands.length > 0) {
    console.error(pc.dim(`Commands: ${fileCommands.map(c => `/${c.name}`).join(', ')}`))
  }

  const invocation = parseCommandInvocation(input)
  let userContent = input
  if (invocation) {
    const command = commandRegistry.get(invocation.commandName)
    if (!command) {
      const available = commandRegistry.getAll().map(c => `/${c.name}`).join(', ')
      console.error(pc.red(`Unknown command: /${invocation.commandName}`))
      console.error(pc.dim(`Available commands: ${available}`))
      process.exit(1)
    }
    userContent = await command.getPromptForCommand(invocation.args)
    console.error(pc.dim(`Command: /${command.name} (${command.source})`))
  }

  // 装配内置工具
  const toolRegistry = createDefaultTools()

  // ── Skill 发现 ──────────────────────────────────────────────────
  // 扫描 ~/.mini-cc/skills/*/SKILL.md，注册到 Skill Tool
  const skillsDir = process.env.SKILLS_DIR || join(homedir(), '.mini-cc', 'skills')
  const skills = await loadSkillsFromDir(skillsDir)
  registerSkillTool(toolRegistry, skills)
  if (skills.length > 0) {
    console.error(pc.dim(`Skills: ${skills.map(s => s.name).join(', ')}`))
  }

  // ── Subagent 系统 ──────────────────────────────────────────────
  // 装载 Agent 定义（内置 + 文件）→ 注册 AgentTool
  const agentsDir = process.env.AGENTS_DIR || join(homedir(), '.mini-cc', 'agents')
  const agentRegistry = new AgentRegistry(BUILT_IN_AGENTS)
  const fileAgents = await loadAgentsFromDir(agentsDir)
  fileAgents.forEach(a => agentRegistry.register(a))
  registerAgentTool(toolRegistry, agentRegistry)
  if (fileAgents.length > 0) {
    console.error(pc.dim(`Agents: ${fileAgents.map(a => a.name).join(', ')}`))
  }

  // ── MCP 服务器发现 ──────────────────────────────────────────────
  // HTTP MCP 无需保持持久连接，每个请求独立
  const mcpServersJson = process.env.MCP_SERVERS
  if (mcpServersJson) {
    try {
      const servers: McpServerEntry[] = JSON.parse(mcpServersJson)
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
    } catch (e) {
      console.error(pc.red(`MCP_SERVERS parse error: ${(e as Error).message}`))
    }
  }

  // 全部工具注册完毕，建立 AgentTool 的全局引用
  finalizeTools(toolRegistry)

  const tools = toolRegistry.getAll()

  console.error(pc.dim(`Model: ${MODEL}  Tools: ${tools.length}`))

  const messages: MessageParam[] = [{ role: 'user', content: userContent }]
  const terminal = await query(messages, tools, (event) => {
    if (event.type === 'text_delta') process.stdout.write(event.text)
  }, { model: MODEL, maxTokens: MAX_TOKENS, maxTurns: MAX_TURNS })

  if (terminal.reason === 'max_turns') {
    console.error(pc.yellow('\n[Max turns reached]'))
  } else if (terminal.reason === 'error') {
    console.error(pc.red(`\n[Error] ${terminal.error}`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(pc.red(`\n[Error] ${(e as Error).message}`))
  process.exit(1)
})
