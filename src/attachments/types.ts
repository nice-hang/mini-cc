// Attachment 是给模型看的运行时上下文，不是用户真实消息，也不是 Tool schema。

export type Attachment =
  | SkillListingAttachment
  | AgentListingDeltaAttachment
  | DeferredToolsDeltaAttachment
  | DeferredToolSchemaDeltaAttachment

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

export type DeferredToolsDeltaAttachment = {
  type: 'deferred_tools_delta'
  addedNames: string[]
  addedLines: string[]
  removedNames: string[]
  isInitial: boolean
}

export type DeferredToolSchemaDeltaAttachment = {
  type: 'deferred_tool_schema_delta'
  addedNames: string[]
  schemaLines: string[]
}
