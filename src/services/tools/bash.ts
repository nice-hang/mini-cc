import { execSync } from 'node:child_process'
import { buildTool } from '../../Tool.js'

export const bashTool = buildTool({
  name: 'bash',
  description: 'Execute a shell command. Use this to run CLI tools, scripts, or system operations.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  call: async (input) => {
    const output = execSync(input.command as string, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    })
    return output.toString()
  },
  // bash 操作全局状态（文件系统、进程），并行执行相互干扰
  isConcurrencySafe: () => false,
  // bash 被中断可能留下正在运行的进程
  interruptBehavior: () => 'block',
})
