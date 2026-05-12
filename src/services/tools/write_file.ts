import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildTool } from '../../Tool.js'

export const writeFileTool = buildTool({
  name: 'write_file',
  description: 'Write content to a file at the given path. Creates parent directories if needed.',
  input_schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to write' },
      content: { type: 'string', description: 'Content to write to the file' },
    },
    required: ['file_path', 'content'],
  },
  call: async (input) => {
    const filePath = input.file_path as string
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(filePath, input.content as string, 'utf-8')
    return `Written to ${filePath}`
  },
  // 写文件不能并行：同一文件同时写入会冲突
  isConcurrencySafe: () => false,
  // 写文件被中断可能导致数据不完整
  interruptBehavior: () => 'block',
})
