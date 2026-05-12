import { buildTool } from '../../Tool.js'

export const webSearchTool = buildTool({
  name: 'web_search',
  description: 'Search the web for information. Returns search results with snippets and URLs.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  call: async (input) => {
    const query = encodeURIComponent(input.query as string)
    const url = `https://html.duckduckgo.com/html/?q=${query}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mini-cc/0.1)' },
    })
    const html = await response.text()
    // 简单解析：提取搜索结果条目
    const results: string[] = []
    const linkRegex = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

    let match: RegExpExecArray | null
    const titles: string[] = []
    while ((match = linkRegex.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]*>/g, '').trim())
    }
    const snippets: string[] = []
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim())
    }

    for (let i = 0; i < Math.min(titles.length, 5); i++) {
      results.push(`${i + 1}. ${titles[i]}\n   ${snippets[i] ?? ''}`)
    }

    return results.length > 0
      ? results.join('\n\n')
      : 'No search results found.'
  },
  // 搜索请求相互独立
  isConcurrencySafe: () => true,
  interruptBehavior: () => 'cancel',
})
