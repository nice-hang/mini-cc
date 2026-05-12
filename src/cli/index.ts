// CLI 入口：单次模式（stdin → Agent → stdout）
//
// 使用方式：
//   echo "What is in package.json?" | npm run dev
//   npm run dev -- --model deepseek-v4-flash < input.txt

import { readFileSync } from 'node:fs'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '../Tool.js'
import { query, type Terminal } from '../query/query.js'
import { readStdin } from './readline.js'

// 自动加载 .env 文件（开发环境）
try {
  const text = readFileSync('.env', 'utf-8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim().replace(/\r$/, '')
      // 剥离可选的双引号/单引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch { /* .env 不存在则跳过 */ }

function showUsage() {
  console.error(`Usage: tsx src/cli/index.ts [options]

Options:
  --model <name>       Model name (default: deepseek-v4-flash)
  --max-tokens <num>   Max output tokens (default: 4096)
  --max-turns <num>    Max agent turns (default: 25)
  -h, --help           Show this help

Pipe input: echo "your question" | npm run dev`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    showUsage()
    process.exit(0)
  }

  // 解析参数
  const model = extractArg(args, '--model') ?? 'deepseek-v4-flash'

  // 检查对应 provider 的 API key
  const needsOpenAI = model.startsWith('deepseek-') || model.startsWith('qwen-')
  if (needsOpenAI) {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error('Error: need OPENAI_API_KEY or ANTHROPIC_API_KEY for this model')
      process.exit(1)
    }
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set')
    process.exit(1)
  }
  const maxTokens = Number(extractArg(args, '--max-tokens') ?? '4096')
  const maxTurns = Number(extractArg(args, '--max-turns') ?? '25')

  // 读入用户输入
  const input = await readStdin()
  if (!input) {
    console.error('No input provided')
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

  const messages: MessageParam[] = [{ role: 'user', content: input }]
  const generator = query(messages, builtinTools, { model, maxTokens, maxTurns })

  try {
    // 手动迭代 Generator，因为 main() 不是 Generator 函数无法用 yield*
    while (true) {
      const { value, done } = await generator.next()
      if (done) {
        // value 是 Terminal
        const terminal = value as Terminal
        if (terminal.reason === 'max_turns') {
          console.error('\n[Max turns reached]')
        } else if (terminal.reason === 'error') {
          console.error(`\n[Error] ${terminal.error}`)
          process.exit(1)
        }
        break
      }
      // value 是 StreamEvent
      if (value.type === 'text_delta') {
        process.stdout.write(value.text)
      }
    }
  } catch (e) {
    console.error(`\n[Error] ${(e as Error).message}`)
    process.exit(1)
  }
}

function extractArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

main()
