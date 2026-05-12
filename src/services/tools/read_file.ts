import { readFileSync } from 'node:fs'
import { buildTool } from '../../Tool.js'

export const readFileTool = buildTool({
  name: 'read_file',
  description: 'Read the contents of a file at the given path.',
  input_schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to read' },
    },
    required: ['file_path'],
  },
  call: async (input) => readFileSync(input.file_path as string, 'utf-8'),
  // 读文件是纯读取，多个同时读不影响彼此
  isConcurrencySafe: () => true,
  // 读文件被中断无所谓，不损失数据
  interruptBehavior: () => 'cancel',
})
