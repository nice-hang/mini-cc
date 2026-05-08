# Mini-Claw

基于 `pi-mono` SDK 的最小化 OpenClaw 变体——一个 CLI 交互的 AI Agent，具备自定义工具集和 Skills 热加载能力。

## Quick Start

```bash
# 安装依赖
npm install

# 配置 API key
cp config.json.example config.json
# 编辑 config.json 填入你的 API key 和模型

# 单次模式
npm start -- -m "你好"

# 交互模式
npm start
```

## 配置

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "apiKey": "sk-..."
}
```

配置优先级：`./config.json` > `~/.mini-claw/config.json` > 环境变量。

支持的 provider 参见 pi-ai 内置列表（anthropic, deepseek, openai, google 等）。

## 用法

### 单次模式

```bash
npm start -- -m "列出当前目录的文件"
```

### 交互模式

```bash
npm start
```

交互模式命令：

| 命令 | 作用 |
|------|------|
| `/help` | 显示帮助 |
| `/skills` | 列出已加载的 skills |
| `/new` | 清空对话历史 |
| `/model` | 显示当前模型 |
| `/model <id>` | 切换模型（如 `/model deepseek-v4-pro`） |
| `/exit` | 退出 |

## Skills

Skills 存放在 `~/.mini-claw/skills/`，每个 skill 一个目录，内含 `SKILL.md`：

```
~/.mini-claw/skills/
  my-skill/
    SKILL.md
```

SKILL.md 格式：

```markdown
---
name: my-skill
description: 这个技能做什么
allowed-tools: Bash(git:*) Read
---

# 完整指令

Agent 需要遵循的详细说明...
```

启动时只加载 name + description（~100 tokens）注入 system prompt。Agent 通过 `read_skill` 工具按需加载完整内容。

## 工具集

| 工具 | 作用 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件 |
| `edit_file` | 精确替换文件内容 |
| `list_directory` | 列出目录 |
| `bash` | 执行 shell 命令 |
| `web_search` | 搜索网络 |
| `web_fetch` | 获取 URL 内容 |

## 项目结构

```
mini-openclaw/
├── src/
│   ├── index.ts              # 入口（单次 + 交互模式）
│   ├── config.ts             # 配置加载
│   ├── tools/
│   │   ├── index.ts          # 工具注册 + system prompt 构建
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── edit-file.ts
│   │   ├── list-directory.ts
│   │   ├── bash.ts
│   │   ├── web-search.ts
│   │   └── web-fetch.ts
│   ├── skills/
│   │   ├── loader.ts         # 技能扫描 + 解析 + read_skill 工具
│   │   └── resolver.ts       # 渐进式 system prompt 注入
│   └── cli/
│       └── repl.ts           # readline REPL
├── config.json.example
└── package.json
```

## vs OpenClaw

| 功能 | OpenClaw | Mini-Claw |
|------|----------|-----------|
| 消息渠道 | 50+ | CLI only |
| Agent Runtime | pi-mono SDK 嵌入 | pi-agent-core 直接使用 |
| 工具集 | 75+ 内置 | 7 个基础工具 |
| Skills | 5700+ 社区技能 | 本地文件热加载 |
| 多模型 | 完整 provider 系统 | pi-ai 统一 API |
