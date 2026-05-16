// Skill Command 发现：目录扫描 SKILL.md，直接注册为 prompt command
//
// 只支持 `~/.mini-cc/skills/<skill-name>/SKILL.md` 格式
// frontmatter 字段：description / when_to_use / allowed-tools / arguments / context
//
// 参考 claude-code：src/skills/loadSkillsDir.ts

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { Command } from '../commands/types.js'
import { parseArgumentNames, substituteArguments } from '../commands/arguments.js'

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

export async function loadSkillsFromDir(skillsDir: string): Promise<Command[]> {
  let entries: string[]
  try {
    entries = await readdir(skillsDir)
  } catch {
    return [] // 目录不存在不是错误
  }

  const results = await Promise.all(
    entries.map(async (entry): Promise<Command | null> => {
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
      // 和 claude-code 一样，skill 的可调用名来自目录名，frontmatter.name 只作为展示名保留给后续 UI。
      const name = entry
      const description = (frontmatter.description as string) || ''
      if (!description) return null

      const ctx = frontmatter.context as string | undefined
      const argumentNames = parseArgumentNames(frontmatter.arguments)
      return {
        type: 'prompt',
        name,
        description,
        source: 'skill',
        kind: 'skill',
        whenToUse: frontmatter.when_to_use as string | undefined,
        allowedTools: parseStringList(frontmatter['allowed-tools'] ?? frontmatter.allowed_tools),
        argumentNames: argumentNames.length > 0 ? argumentNames : undefined,
        context: ctx === 'fork' ? 'fork' : 'inline',
        contentLength: content.length,
        async getPromptForCommand(args: string): Promise<string> {
          let finalContent = substituteArguments(
            content,
            args,
            argumentNames,
          )

          // Skill 资源常和 SKILL.md 同目录放在一起，保留官方的目录变量约定。
          finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)

          return finalContent
        },
      }
    }),
  )

  return results.filter((command): command is Command => command !== null)
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map(String).map(s => s.trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string') {
    const items = value.split(',').map(s => s.trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  return undefined
}
