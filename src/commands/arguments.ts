// 参数替换保留 Claude Code 的核心约定：模板只关心 $ARGUMENTS / $0 / $name。

export function parseArgumentNames(value: unknown): string[] {
  // frontmatter 可以写成字符串或数组；这里统一成数组，后续替换逻辑不关心来源格式。
  if (Array.isArray(value)) {
    return value.map(String).map(s => s.trim()).filter(isValidArgumentName)
  }
  if (typeof value === 'string') {
    return value.split(/[\s,]+/).map(s => s.trim()).filter(isValidArgumentName)
  }
  return []
}

export function substituteArguments(
  content: string,
  args: string,
  argumentNames: string[] = [],
): string {
  // 调用时才替换参数，保证 command 定义本身可以被缓存和复用。
  const parsedArgs = splitArguments(args)
  const originalContent = content

  // 命名参数是对位置参数的语义包装：$topic 和 $0 指向同一个输入。
  for (let i = 0; i < argumentNames.length; i++) {
    const name = argumentNames[i]
    if (!name) continue
    content = content.replace(new RegExp(`\\$${name}(?![\\[\\w])`, 'g'), parsedArgs[i] ?? '')
    content = content.replace(new RegExp(`\\$\\{${name}\\}`, 'g'), parsedArgs[i] ?? '')
  }

  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, index: string) => parsedArgs[Number(index)] ?? '')
  content = content.replace(/\$(\d+)(?!\w)/g, (_, index: string) => parsedArgs[Number(index)] ?? '')
  content = content.replaceAll('$ARGUMENTS', args)

  // 没写占位符时仍保留用户参数，避免 /command foo 静默丢掉 foo。
  if (content === originalContent && args.trim()) {
    return `${content.trimEnd()}\n\nARGUMENTS: ${args}`
  }
  return content
}

function isValidArgumentName(name: string): boolean {
  // 纯数字会和 $0 / $1 位置参数冲突，直接过滤掉。
  return name.length > 0 && !/^\d+$/.test(name)
}

function splitArguments(args: string): string[] {
  // 只做轻量 shell-like 切分，足够支持带空格的引号参数，不引入完整 shell 语义。
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaped = false

  for (const char of args) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) result.push(current)
  return result
}
