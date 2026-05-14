// Agent 发现：目录扫描 + frontmatter 解析
//
// 与 Skill 系统相同的模式：
//   `~/.mini-cc/agents/<name>/AGENT.md`
//
// 参考 src/skills/loader.ts

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { AgentDefinition } from './types.js'

// ─── Frontmatter 解析（轻量，复用 skills/loader.ts 的模式） ─────

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  content: string
} {
  const frontmatter: Record<string, unknown> = {}

  if (!raw.startsWith('---\n')) return { frontmatter, content: raw }

  const endIndex = raw.indexOf('\n---\n', 4)
  if (endIndex === -1) return { frontmatter, content: raw }

  const block = raw.slice(4, endIndex)
  const body = raw.slice(endIndex + 5)

  for (const line of block.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    let value: unknown = line.slice(colonIndex + 1).trim()

    if (!value) continue

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }

    frontmatter[key] = value
  }

  return { frontmatter, content: body.trimStart() }
}

// ─── 目录扫描 ──────────────────────────────────────────────────

export async function loadAgentsFromDir(agentsDir: string): Promise<AgentDefinition[]> {
  let entries: string[]
  try {
    entries = await readdir(agentsDir)
  } catch {
    return []
  }

  const results = await Promise.all(
    entries.map(async (entry): Promise<AgentDefinition | null> => {
      const agentDir = join(agentsDir, entry)
      let entryStat
      try {
        entryStat = await stat(agentDir)
      } catch {
        return null
      }
      if (!entryStat.isDirectory()) return null

      const agentFilePath = join(agentDir, 'AGENT.md')
      let raw: string
      try {
        raw = await readFile(agentFilePath, 'utf-8')
      } catch {
        return null
      }

      const { frontmatter, content } = parseFrontmatter(raw)

      return {
        name: (frontmatter.name as string) || entry,
        description: (frontmatter.description as string) || '',
        whenToUse: frontmatter.when_to_use as string | undefined,
        systemPrompt: content,
        allowedToolNames: Array.isArray(frontmatter.allowed_tools)
          ? (frontmatter.allowed_tools as string[])
          : [],
        baseDir: agentDir,
        filename: 'AGENT.md',
      }
    }),
  )

  return results.filter((a): a is AgentDefinition => a !== null && !!a.description)
}
