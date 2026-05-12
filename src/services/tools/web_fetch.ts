import { buildTool } from '../../Tool.js'

export const webFetchTool = buildTool({
  name: 'web_fetch',
  description: 'Fetch content from a URL. Returns the raw response text.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
    },
    required: ['url'],
  },
  call: async (input) => {
    const response = await fetch(input.url as string)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.text()
  },
  // 网络请求相互独立，可以并行
  isConcurrencySafe: () => true,
  // fetch 被中断没有副作用
  interruptBehavior: () => 'cancel',
})
