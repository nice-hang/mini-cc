// Attachment 是给模型看的运行时上下文，不是用户真实消息，也不是 Tool schema。

export type Attachment =
  | SkillListingAttachment
  | AgentListingDeltaAttachment

export type SkillListingAttachment = {
  type: 'skill_listing'
  content: string
  skillCount: number
  isInitial: boolean
}

export type AgentListingDeltaAttachment = {
  type: 'agent_listing_delta'
  addedTypes: string[]
  addedLines: string[]
  removedTypes: string[]
  isInitial: boolean
}
