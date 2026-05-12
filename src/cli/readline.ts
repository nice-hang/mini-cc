// 读取用户输入：管道模式 stdin 或 TTY 交互提示
import { createInterface } from 'node:readline'

export function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    // TTY 模式：交互式提示
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
      rl.question('> ', (answer) => {
        rl.close()
        resolve(answer.trim())
      })
    })
  }
  // 管道模式：读取全部 stdint
  const rl = createInterface({ input: process.stdin })
  let text = ''
  rl.on('line', (line) => { text += line + '\n' })
  return new Promise(resolve => {
    rl.on('close', () => resolve(text.trimEnd()))
  })
}
