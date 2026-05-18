// AgentTool：模型通过此工具发现和调用子 Agent
//
// 跟 Skill Tool 一样，Tool schema 保持稳定：
// - 动态 Agent 列表通过 discovery attachment 注入
// - subagent_type 是自由字符串（非枚举），模型从描述中了解可用选项
// - 调 AgentTool({ subagent_type: "explore", prompt: "..." }) 启动子 Agent
//
// 参考 claude-code：packages/builtin-tools/src/tools/AgentTool/

import { buildTool } from '../../Tool.js'
import { runAgent } from '../../coordinator/runAgent.js'
import { filterToolsForAgent } from '../../coordinator/toolFilter.js'
import type { AgentRegistry } from '../../coordinator/agents.js'
import type { Tool } from '../../Tool.js'
import type { CommandRegistry } from '../../commands/registry.js'
import { buildDiscoveryAttachments } from '../../discovery/listings.js'

type AgentToolOptions = {
  parentSystemPrompt?: string
  commandRegistry: CommandRegistry
}

// 运行时注入的"全部工具"引用，由 tools.ts 在注册完成后设置
// AgentTool.call() 时用它做工具过滤
let _allTools: Tool[] = []

export function updateAllTools(tools: Tool[]): void {
  _allTools = tools
}

export function createAgentTool(registry: AgentRegistry, options: AgentToolOptions): Tool {
  return buildTool({
    name: 'AgentTool',
    description: [
      '创建一个子 Agent 独立执行复杂任务。',
      '可用 Agent 类型会在对话中的 <system-reminder> 里列出；使用 subagent_type 选择类型，省略时默认 general。',
      '子 Agent 从独立对话开始，请在 prompt 中写清楚目标、背景、已知信息和期望输出。',
    ].join('\n'),

    input_schema: {
      type: 'object',
      properties: {
        subagent_type: {
          type: 'string',
          description: '子 Agent 类型，如 "general"、"explore"。可用类型见 system-reminder。',
        },
        prompt: {
          type: 'string',
          description: '子 Agent 的任务描述',
        },
      },
      required: ['prompt'],
    },

    async call(input): Promise<string> {
      const subagentType = (input.subagent_type as string) || 'general'
      const prompt = input.prompt as string
      const agentDef = registry.get(subagentType)

      if (!agentDef) {
        const available = registry.getAll().map(a => `"${a.name}"`).join(', ')
        return `错误：未找到子 Agent 类型 "${subagentType}"。可用类型：${available}`
      }

      const agentTools = filterToolsForAgent(agentDef, _allTools)

      if (agentTools.length === 0) {
        return `错误：子 Agent "${subagentType}" 没有可用工具（所有工具被过滤）`
      }

      const { result, terminal } = await runAgent(prompt, agentDef, agentTools, {
        systemPrompt: buildSubagentSystemPrompt(agentDef.systemPrompt, options.parentSystemPrompt),
        attachments: buildDiscoveryAttachments({
          commandRegistry: options.commandRegistry,
          agentRegistry: registry,
          tools: agentTools,
        }),
      })

      if (terminal.reason === 'error') {
        return `[子 Agent 错误] ${terminal.error}\n\n${result}`
      }

      return result
    },

    isConcurrencySafe: () => false,
    interruptBehavior: () => 'block',
  })
}

function buildSubagentSystemPrompt(agentSystemPrompt: string, parentSystemPrompt?: string): string {
  if (!parentSystemPrompt) return agentSystemPrompt

  // 子 Agent 继承项目现场，但最终职责由自己的 agent system prompt 收束。
  return [
    parentSystemPrompt,
    '## 子 Agent 指令',
    agentSystemPrompt,
  ].join('\n\n')
}
