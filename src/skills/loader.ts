// Skill 发现：目录扫描 + frontmatter 解析
//
// 只支持 `~/.mini-cc/skills/<skill-name>/SKILL.md` 格式
// frontmatter 字段：name / description / when_to_use / allowed_tools / arguments
//
// 参考 claude-code：src/skills/loadSkillsDir.ts

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { Skill } from './types.js'

// ─── Frontmatter 解析（轻量，不依赖 yaml 库） ─────────────────

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const frontmatter: Record<string, unknown> = {}

  // 标准 frontmatter：首行 ---，之后 --- 结束
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

    // 空值跳过
    if (!value) continue

    // 列表值："[item1, item2]"
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }

    frontmatter[key] = value
  }

  return { frontmatter, content: body.trimStart() }
}

// ─── 目录扫描 ──────────────────────────────────────────────────

export async function loadSkillsFromDir(skillsDir: string): Promise<Skill[]> {
  let entries: string[]
  try {
    entries = await readdir(skillsDir)
  } catch {
    return [] // 目录不存在不是错误
  }

  const results = await Promise.all(
    entries.map(async (entry): Promise<Skill | null> => {
      const skillDir = join(skillsDir, entry)
      let entryStat
      try {
        entryStat = await stat(skillDir)
      } catch {
        return null
      }
      if (!entryStat.isDirectory()) return null

      const skillFilePath = join(skillDir, 'SKILL.md')
      let raw: string
      try {
        raw = await readFile(skillFilePath, 'utf-8')
      } catch {
        return null
      }

      const { frontmatter, content } = parseFrontmatter(raw)
      const name = (frontmatter.name as string) || entry

      return {
        name,
        description: (frontmatter.description as string) || '',
        whenToUse: frontmatter.when_to_use as string | undefined,
        content,
        allowedTools: Array.isArray(frontmatter.allowed_tools)
          ? (frontmatter.allowed_tools as string[])
          : undefined,
        baseDir: skillDir,
        argumentNames: Array.isArray(frontmatter.arguments)
          ? (frontmatter.arguments as string[])
          : typeof frontmatter.arguments === 'string'
            ? (frontmatter.arguments as string).split(',').map(s => s.trim())
            : undefined,
      }
    }),
  )

  return results.filter((s): s is Skill => s !== null && !!s.description)
}
