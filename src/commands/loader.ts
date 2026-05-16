// Markdown command loader：把 ~/.mini-cc/commands/*.md 转成 prompt command。

import { readdir, readFile, stat } from 'fs/promises'
import { basename, join } from 'path'
import type { Command } from './types.js'
import { parseArgumentNames, substituteArguments } from './arguments.js'

type ParsedMarkdown = {
  frontmatter: Record<string, unknown>
  content: string
}

export async function loadCommandsFromDir(commandsDir: string): Promise<Command[]> {
  let entries: string[]
  try {
    entries = await readdir(commandsDir)
  } catch {
    // 用户没创建 commands 目录是正常状态，不能阻断 CLI 启动。
    return []
  }

  const commands = await Promise.all(
    entries.map(async (entry): Promise<Command | null> => {
      const filePath = join(commandsDir, entry)
      let fileStat
      try {
        fileStat = await stat(filePath)
      } catch {
        return null
      }
      // 本课只支持单文件 markdown command，递归和 SKILL.md 留到后续 Skill 迁移。
      if (!fileStat.isFile() || !entry.endsWith('.md')) return null

      let raw: string
      try {
        raw = await readFile(filePath, 'utf-8')
      } catch {
        return null
      }

      const { frontmatter, content } = parseFrontmatter(raw)
      const name = String(frontmatter.name || basename(entry, '.md')).trim()
      const description = String(frontmatter.description || '').trim()
      // description 是 command 的可发现性入口；缺失时跳过，避免注册“沉默命令”。
      if (!name || !description) return null

      const allowedTools = parseStringList(frontmatter['allowed-tools'] ?? frontmatter.allowed_tools)
      const argumentNames = parseArgumentNames(frontmatter.arguments)

      return {
        type: 'prompt',
        name,
        description,
        source: 'user',
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        argumentNames: argumentNames.length > 0 ? argumentNames : undefined,
        contentLength: content.length,
        async getPromptForCommand(args: string) {
          // command 正文保持冷加载语义：只有被 /name 调用时才做参数展开。
          return substituteArguments(content, args, argumentNames)
        },
      }
    }),
  )

  return commands.filter((command): command is Command => command !== null)
}

function parseFrontmatter(raw: string): ParsedMarkdown {
  const frontmatter: Record<string, unknown> = {}
  // 没有 frontmatter 的文件仍可作为 markdown 内容存在，但不会通过 description 校验注册。
  if (!raw.startsWith('---\n')) return { frontmatter, content: raw.trimStart() }

  const endIndex = raw.indexOf('\n---\n', 4)
  // frontmatter 没闭合时按普通 markdown 处理，比半解析出错误 metadata 更安全。
  if (endIndex === -1) return { frontmatter, content: raw.trimStart() }

  const block = raw.slice(4, endIndex)
  const content = raw.slice(endIndex + 5).trimStart()

  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.slice(0, colonIndex).trim()
    const value = parseScalar(trimmed.slice(colonIndex + 1).trim())
    if (key && value !== undefined) frontmatter[key] = value
  }

  return { frontmatter, content }
}

function parseScalar(value: string): unknown {
  if (!value) return undefined
  // 轻量 parser 只覆盖课程需要的标量和一行数组，不试图实现完整 YAML。
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean)
  }
  return value
}

function parseStringList(value: unknown): string[] {
  // allowed-tools 同时兼容 "a, b" 和 [a, b]，方便手写命令文件。
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
