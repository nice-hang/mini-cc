// StreamEvent：Agent 循环向外产出的事件
// 调用者监听这些事件来渲染 UI 或处理中间结果

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  | { type: 'done'; stop_reason?: string }
