// Context/System Prompt：把 Agent 的稳定规则和项目现场整理成模型的 system 输入。

import { readFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'

const execFileAsync = promisify(execFile)

export interface SystemContext {
  cwd: string
  date: string
  platform: NodeJS.Platform
  projectInstructions?: string
  git?: GitContext
}

export interface GitContext {
  branch?: string
  status?: string
  diffStat?: string
}

export async function buildSystemPrompt(cwd = process.cwd()): Promise<string> {
  const context: SystemContext = {
    cwd,
    date: new Date().toISOString().slice(0, 10),
    platform: process.platform,
    projectInstructions: await loadProjectInstructions(cwd),
    git: await loadGitContext(cwd),
  }

  return renderSystemPrompt(context)
}

async function loadProjectInstructions(cwd: string): Promise<string | undefined> {
  const candidates = ['AGENTS.md', 'CLAUDE.md']
  const parts: string[] = []

  for (const file of candidates) {
    const content = await readTextIfExists(join(cwd, file))
    if (content?.trim()) {
      parts.push(`### ${file}\n${content.trim()}`)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined
}

async function loadGitContext(cwd: string): Promise<GitContext | undefined> {
  const branch = await runGit(cwd, ['branch', '--show-current'])
  const status = await runGit(cwd, ['status', '--short'])
  const diffStat = await runGit(cwd, ['diff', '--stat'])

  if (!branch && !status && !diffStat) return undefined

  return {
    branch: branch || undefined,
    status: status || undefined,
    diffStat: diffStat || undefined,
  }
}

function renderSystemPrompt(context: SystemContext): string {
  const sections: string[] = [
    [
      '你是 mini-cc，一个用于学习 Claude Code 架构的代码 Agent。',
      '你的目标是用简洁、可读、贴近源码范式的方式帮助用户理解并实现 Agent 工程机制。',
      '优先直接完成用户请求；需要改代码时保持改动聚焦，不重写无关文件。',
    ].join('\n'),
    [
      '## 工具使用原则',
      '- 先理解现有代码，再做实现判断。',
      '- 文件搜索优先使用 rg；读取文件保持范围明确。',
      '- 对写入、执行命令、MCP、子 Agent 等能力，按当前工具系统暴露的能力使用。',
      '- 不要撤销用户已有改动；遇到无关脏改动时忽略，遇到相关改动时顺着它继续做。',
    ].join('\n'),
    [
      '## 当前环境',
      `- cwd: ${context.cwd}`,
      `- date: ${context.date}`,
      `- platform: ${context.platform}`,
    ].join('\n'),
  ]

  if (context.projectInstructions) {
    sections.push(['## 项目指令', context.projectInstructions].join('\n'))
  }

  if (context.git) {
    sections.push(renderGitContext(context.git))
  }

  return sections.join('\n\n')
}

function renderGitContext(git: GitContext): string {
  const lines = ['## Git 上下文']
  if (git.branch) lines.push(`- branch: ${git.branch}`)
  if (git.status) lines.push(['- status:', fenced(git.status)].join('\n'))
  if (git.diffStat) lines.push(['- diff stat:', fenced(git.diffStat)].join('\n'))
  return lines.join('\n')
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 2000,
      maxBuffer: 64 * 1024,
    })
    const text = stdout.trim()
    return text || undefined
  } catch {
    // 非 git 仓库或 git 不可用时，Context 降级为空，不影响 Agent 启动。
    return undefined
  }
}

function fenced(content: string): string {
  return `\`\`\`\n${content}\n\`\`\``
}
