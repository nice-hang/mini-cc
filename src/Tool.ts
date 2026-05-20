// Tool 定义：Agent 能调用的外部函数
//
// 包含两部分：
//   定义（name/description/input_schema）— 发给模型，告诉它能调什么
//   执行（call）— 实际干活，模型决定调了之后运行
//
// 使用 buildTool() 创建实例，自动补全安全的默认值

export interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }

  // 执行函数：接收模型传来的参数，返回文本结果
  call(input: Record<string, unknown>): Promise<string>

  // 并发安全：同一轮多个实例能否同时执行
  // 读文件、fetch 是安全的；写文件、bash 是不安全的
  // 不安全意味着同一轮最多只有一个实例在运行
  isConcurrencySafe(input: Record<string, unknown>): boolean

  // 中断行为：用户发新消息时当前工具怎么办
  // 'cancel' — 丢弃结果（只读工具适合，不损失数据）
  // 'block'  — 等当前执行完再处理新消息（写入工具适合）
  interruptBehavior(): 'cancel' | 'block'

  // MCP 工具默认不把完整 schema 放进首轮请求，由 ToolSearch 按需加载。
  isMcp?: boolean
  alwaysLoad?: boolean
  searchHint?: string
}

export type ToolResult = {
  tool_use_id: string
  content: string
  is_error?: boolean
}

// buildTool：用安全的默认值补全可选字段
// 工具定义只需要提供 name + description + input_schema + call，
// 其余字段自动获得保守的默认值
export function buildTool(
  def: Omit<Partial<Tool>, 'call'> & Pick<Tool, 'name' | 'description' | 'input_schema' | 'call'>,
): Tool {
  return {
    isConcurrencySafe: () => false,
    interruptBehavior: () => 'block',
    ...def,
  }
}
