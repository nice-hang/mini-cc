import { readFileSync, writeFileSync } from 'node:fs'
import { buildTool } from '../../Tool.js'

export const editFileTool = buildTool({
  name: 'edit_file',
  description: 'Find and replace text in a file. Replaces the first occurrence of old_string with new_string.',
  input_schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      old_string: { type: 'string', description: 'Text to search for (must match exactly, including whitespace)' },
      new_string: { type: 'string', description: 'Text to replace with' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  call: async (input) => {
    const filePath = input.file_path as string
    const oldStr = input.old_string as string
    const newStr = input.new_string as string

    const content = readFileSync(filePath, 'utf-8')
    if (!content.includes(oldStr)) {
      return `Error: Could not find old_string in ${filePath}`
    }
    const updated = content.replace(oldStr, newStr)
    writeFileSync(filePath, updated, 'utf-8')
    return `Applied edit to ${filePath}`
  },
  // 编辑涉及写文件，同一文件并行编辑冲突
  isConcurrencySafe: () => false,
  // 编辑中断可能导致文件损坏
  interruptBehavior: () => 'block',
})
