// Attachment Renderer：把结构化运行时上下文渲染成 Claude Messages 能承载的 user message。

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { Attachment } from './types.js'

export function renderAttachmentsAsMessages(attachments: Attachment[] | undefined): MessageParam[] {
  if (!attachments || attachments.length === 0) return []

  return attachments.map(attachment => ({
    role: 'user',
    content: renderSystemReminder(renderAttachment(attachment)),
  }))
}

function renderAttachment(attachment: Attachment): string {
  switch (attachment.type) {
    case 'skill_listing':
      return [
        'Available skills are listed below. When a skill matches the user task, call the Skill tool before answering.',
        attachment.content,
      ].join('\n\n')

    case 'agent_listing_delta':
      return renderAgentListingDelta(attachment)
  }
}

function renderAgentListingDelta(attachment: Extract<Attachment, { type: 'agent_listing_delta' }>): string {
  const sections: string[] = []

  if (attachment.isInitial) {
    sections.push('Available subagent types are listed below. Use AgentTool only when delegation helps the task.')
  } else {
    sections.push('Subagent availability changed.')
  }

  if (attachment.addedLines.length > 0) {
    sections.push(['Added or available subagents:', ...attachment.addedLines].join('\n'))
  }

  if (attachment.removedTypes.length > 0) {
    sections.push(['Removed subagent types:', ...attachment.removedTypes.map(type => `- ${type}`)].join('\n'))
  }

  return sections.join('\n\n')
}

function renderSystemReminder(content: string): string {
  return `<system-reminder>\n${content}\n</system-reminder>`
}
