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
import { readStdin } from './readline.js'
import { createRuntime, runOnce } from './runtime.js'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-flash'
const MAX_TOKENS = 4096
const MAX_TURNS = 25

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

  // Runtime 初始化先于单次输入执行；后续 Context / REPL 都接在这个边界上。
  const runtime = await createRuntime({
    model: MODEL,
    maxTokens: MAX_TOKENS,
    maxTurns: MAX_TURNS,
  })

  // 读入用户输入
  const input = await readStdin()
  if (!input) {
    console.error(pc.dim('Pipe input: echo "your question" | npm run dev'))
    process.exit(1)
  }

  const result = await runOnce(runtime, input, text => process.stdout.write(text))
  if (result.type === 'unknown_command') {
    console.error(pc.red(`Unknown command: /${result.commandName}`))
    console.error(pc.dim(`Available commands: ${result.availableCommands.join(', ')}`))
    process.exit(1)
  }

  const terminal = result.terminal
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
