// Tool 定义：Agent 能调用的外部函数
// 直接使用 SDK 的 input_schema 格式，省去字段映射

export interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

export type ToolResult = {
  tool_use_id: string
  content: string
  is_error?: boolean
}
