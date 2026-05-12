// CLI 入口：单次模式（stdin → Agent → stdout）
//
// 使用方式：
//   echo "What is in package.json?" | npm run dev
//   npm run dev < input.txt

import { config as loadEnv } from 'dotenv'
import pc from 'picocolors'
loadEnv()
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import { query } from '../query/query.js'
import { readStdin } from './readline.js'

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

  // 读入用户输入
  const input = await readStdin()
  if (!input) {
    console.error(pc.dim('Pipe input: echo "your question" | npm run dev'))
    process.exit(1)
  }

  // 内置工具定义（传给模型的 schema）
  const builtinTools: Tool[] = [
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      input_schema: {
        type: 'object',
        properties: { file_path: { type: 'string', description: 'Path to the file' } },
        required: ['file_path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['file_path', 'content'],
      },
    },
    {
      name: 'bash',
      description: 'Run a shell command',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Command to run' } },
        required: ['command'],
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch content from a URL',
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to fetch' } },
        required: ['url'],
      },
    },
  ]

  console.error(pc.dim(`Model: ${MODEL}`))

  const messages: MessageParam[] = [{ role: 'user', content: input }]
  const terminal = await query(messages, builtinTools, (event) => {
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
