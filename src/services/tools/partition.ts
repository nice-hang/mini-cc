// 工具调用分组与执行编排
//
// partitionToolCalls：将同一轮的多个工具调用分组
//   原则：相邻的安全调用合并为一批并行执行，不安全调用各成一批串行执行
//   保持原始顺序：安全组在组间保持顺序，不安全调用也在顺序中
//
// executeToolGroups：按分组执行，安全组内 Promise.all，不安全组内逐次 await

import type { Tool } from '../../Tool.js'

export type ToolCallGroup = {
  isConcurrencySafe: boolean
  calls: { id: string; name: string; input: Record<string, unknown> }[]
}

// 将工具调用按并发安全标记分组
export function partitionToolCalls(
  calls: { id: string; name: string; input: Record<string, unknown> }[],
  getTool: (name: string) => Tool | undefined,
): ToolCallGroup[] {
  return calls.reduce<ToolCallGroup[]>((acc, call) => {
    const tool = getTool(call.name)
    let isConcurrencySafe = false
    try {
      isConcurrencySafe = tool?.isConcurrencySafe(call.input) ?? false
    } catch {
      // isConcurrencySafe 抛异常时保守处理：当作不安全
    }

    // 相邻的安全调用合并到同一组
    if (isConcurrencySafe && acc.length > 0 && acc[acc.length - 1].isConcurrencySafe) {
      acc[acc.length - 1].calls.push(call)
    } else {
      acc.push({ isConcurrencySafe, calls: [call] })
    }
    return acc
  }, [])
}

// 按分组顺序执行，返回所有 tool_result
export async function executeToolGroups(
  groups: ToolCallGroup[],
  getTool: (name: string) => Tool | undefined,
): Promise<{ tool_use_id: string; content: string; is_error?: boolean }[]> {
  const results: { tool_use_id: string; content: string; is_error?: boolean }[] = []

  for (const group of groups) {
    const batch = group.calls.map(async (call) => {
      const tool = getTool(call.name)
      if (!tool) {
        return { tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true }
      }
      try {
        return { tool_use_id: call.id, content: await tool.call(call.input) }
      } catch (e) {
        return { tool_use_id: call.id, content: `Error: ${(e as Error).message}`, is_error: true }
      }
    })

    if (group.isConcurrencySafe) {
      // 安全组：并行执行
      const groupResults = await Promise.all(batch)
      results.push(...groupResults)
    } else {
      // 不安全组：串行执行（每组刚好一个 call，但逐次 await 确保顺序）
      for (const promise of batch) {
        results.push(await promise)
      }
    }
  }

  return results
}
