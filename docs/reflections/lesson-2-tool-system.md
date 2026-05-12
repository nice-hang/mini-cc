# 第 2 课：Tool 系统

> 本教程是 mini-cc 系列的第 2 篇，对应课程：[ROADMAP.md](../../ROADMAP.md) 中的第 2 课。
> 代码实现见 `src/Tool.ts` + `src/tools.ts` + `src/services/tools/`，参考源码为 claude-code 的 `deps/claude-code/src/Tool.ts` + `deps/claude-code/src/tools.ts` + `deps/claude-code/src/services/tools/toolOrchestration.ts`。

---

## 本质

> Tool 是 Agent 连接外部世界的桥梁。Tool 系统解决的核心问题是：**如何让 LLM 安全、可控地调用外部函数**。

Tool 系统包含三层：
1. **定义层** — 告诉模型可以调什么（name + description + JSON Schema）
2. **注册层** — 管理工具的增删查改
3. **执行层** — 按并发安全规则编排工具调用

## 为什么需要它

第 1 课我们把工具执行逻辑硬编码在 `query.ts` 中：

```typescript
// 第 1 课的做法：工具定义和执行散落在各处
const toolHandlers: Record<string, Function> = {
  read_file: async (input) => readFileSync(input.file_path, 'utf-8'),
  write_file: async (input) => { writeFileSync(...); return `Written to ...` },
  bash: async (input) => execSync(input.command),
  web_fetch: async (input) => { const r = await fetch(input.url); return r.text() },
}
```

这样做有几个问题：

- **工具定义（schema）和执行逻辑（call）分离** — 定义在 `cli/index.ts`，实现在 `query.ts`，改一个工具需要改两处
- **所有工具一哄而上并行执行** — `Promise.all()` 不分安全/不安全，写文件和读文件同时进行可能冲突
- **无法动态增减工具** — MCP 协议需要运行时注册新工具（第 3 课），硬编码方案做不到
- **工具缺乏自描述能力** — 模型不知道工具是读还是写、能不能并行、中断了会怎样

Tool 系统把这些问题一次性解决。

## 设计意图

- **约束 1：工具定义必须自包含** — 一个工具要知道自己的名字、参数 schema、执行函数、并发安全属性。所有信息在一起，不需要查外部注册表。
- **约束 2：并发安全由工具自己声明** — 框架不猜测工具是否能并行。读文件安全，写文件不安全，bash 永远不安全。工具最了解自己。
- **约束 3：保持原始调用顺序** — 模型发出的工具列表有隐含顺序（先写配置文件再读它），分组不能重排。
- **Trade-off：用 `buildTool` 默认值简化重复代码** — 每个工具都要声明 `isConcurrencySafe` 和 `interruptBehavior`，但大多数工具选保守值（不安全 + block）。`buildTool` 自动填入默认值，工具只需 override 自己不同的。

## 关键模式

### 模式 1：Tool 接口 — 定义与执行合一

```typescript
export interface Tool {
  name: string
  description: string
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] }

  call(input: Record<string, unknown>): Promise<string>

  isConcurrencySafe(input: Record<string, unknown>): boolean
  interruptBehavior(): 'cancel' | 'block'
}
```

**为什么这样设计？**

把 schema（发给模型的部分）和 call（执行的部分）放在同一个接口里，确保一个工具的所有信息都在一处。`isConcurrencySafe` 接受 `input` 参数是因为同一工具不同输入的并发安全性可能不同（比如读不同文件是安全的，读同一文件可能不安全 —— 不过 mini-cc 阶段我们暂不细化到这种粒度）。

`buildTool` 助手函数自动填入安全默认值：

```typescript
export function buildTool(def) {
  return {
    isConcurrencySafe: () => false,   // 默认不安全
    interruptBehavior: () => 'block',  // 默认阻塞
    ...def,
  }
}
```

只读工具 override `isConcurrencySafe: () => true` 和 `interruptBehavior: () => 'cancel'`，写入工具直接用默认值。

### 模式 2：ToolRegistry — 按名索引

```typescript
export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void { this.tools.set(tool.name, tool) }
  unregister(name: string): boolean { return this.tools.delete(name) }
  get(name: string): Tool | undefined { return this.tools.get(name) }
  getAll(): Tool[] { return Array.from(this.tools.values()) }
}
```

**为什么这样设计？**

执行阶段需要 O(1) 按工具名查找。Registry 的 `getAll()` 返回 `Tool[]` 直接发给模型做 schema 定义；`get(name)` 在执行阶段按名找到对应工具。

### 模式 3：partitionToolCalls — 并发分组算法

```typescript
export function partitionToolCalls(calls, getTool): ToolCallGroup[] {
  return calls.reduce((acc, call) => {
    const tool = getTool(call.name)
    const isConcurrencySafe = tool?.isConcurrencySafe(call.input) ?? false

    // 相邻的安全调用合并为同一批
    if (isConcurrencySafe && acc.length > 0 && acc[acc.length - 1].isConcurrencySafe) {
      acc[acc.length - 1].calls.push(call)
    } else {
      acc.push({ isConcurrencySafe, calls: [call] })
    }
    return acc
  }, [])
}
```

**为什么这样设计？**

关键洞察是：保持原始调用顺序的同时最大化并发度。算法做了三件事：

1. **扫描** — 检查每个工具调用的并发安全标记
2. **合并** — 相邻的 safe 调用打包成一整批
3. **分界** — unsafe 调用成为批次之间的分界点

示例：模型发出 `[read(A), read(B), write(C), read(D)]`

```
分组结果：
  Group 1: [read(A), read(B)]  → 并行（都是 safe）
  Group 2: [write(C)]           → 串行（unsafe）
  Group 3: [read(D)]            → 串行（safe 但只有 1 个）
```

executeToolGroups 按分组执行：

```typescript
for (const group of groups) {
  if (group.isConcurrencySafe) {
    const results = await Promise.all(group.calls.map(call => execute(call)))
    // 全部完成后一起返回
  } else {
    for (const call of group.calls) {
      const result = await execute(call)
      // 逐个返回
    }
  }
}
```

## 各工具设计决策

| 工具 | 并发安全 | 中断行为 | 理由 |
|------|---------|---------|------|
| read_file | ✅ | cancel | 只读，多个读操作互不影响 |
| write_file | ❌ | block | 写入同一文件会冲突 |
| edit_file | ❌ | block | 读-改-写三部曲，不能中断 |
| bash | ❌ | block | 全局副作用（文件、进程） |
| web_fetch | ✅ | cancel | HTTP 请求相互独立 |
| web_search | ✅ | cancel | 搜索请求相互独立 |

## 实现要点

### Happy Path

1. 定义 `Tool` 接口（name, description, input_schema, call, isConcurrencySafe, interruptBehavior）
2. 创建 `buildTool()` 用默认值补全
3. 实现 `ToolRegistry`（register → unregister → get → getAll）
4. 用 `buildTool({...})` 写每个工具的文件
5. 实现 `partitionToolCalls` + `executeToolGroups`
6. 在 `query.ts` 中替换硬编码的 toolHandlers
7. `cli/index.ts` 使用 `createDefaultTools().getAll()` 提供工具

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 模型调了未注册的工具 | getTool 返回 undefined → 返回 "Unknown tool: xxx" is_error |
| isConcurrencySafe 抛异常 | try/catch 兜底，保守当作不安全 |
| 工具 call 抛异常 | try/catch 兜底，返回 "Error: xxx" is_error |
| 空工具列表 | 工具列表为空 → 模型只做文本回复，不调工具 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/Tool.ts` | `src/Tool.ts` | 只保留最核心字段（name/desc/schema/call/concurrency/interrupt），去掉 UI 渲染、权限校验等 40+ 字段 |
| `src/services/tools/partition.ts` | `src/services/tools/toolOrchestration.ts` | 算法一致，但 mini-cc 同步执行（async/await），claude-code 用 AsyncGenerator 流式产出每个工具的结果 |
| `src/services/tools/bash.ts` | `services/tools/BashTool/` | core 逻辑相同，mini-cc 不加 shell 解析和路径安全检查 |
| `src/tools.ts` | `src/tools.ts` | claude-code 有 30+ 工具（Agent/Skill/Grep/Task 等），mini-cc 只保留 6 个基础工具 |

claude-code 的 `Tool` 类型有 50+ 字段，涵盖 UI 渲染（`renderToolUseMessage`）、权限校验（`checkPermissions`）、Schema 验证（`validateInput`）等。mini-cc 只取其骨架，保留最核心的设计模式：

- **定义与执行合一** — 工具自包含
- **并发安全声明** — 工具自己说能不能并行
- **buildTool 默认值模式** — 减少重复代码

## 学到的设计教训

1. **并发安全是工具的责任，不是框架的责任** — 框架无法判断 `bash "rm -rf /"` 和 `bash "echo hello"` 哪个能并行。让工具根据自身语义决定，是最正确的抽象层级。

2. **保持调用顺序是正确性的底线** — 模型发出 `[write_config, read_config]` 是有含义的。任何分组算法都不能重排顺序。`partitionToolCalls` 用"相邻 safe 合并"而非"所有 safe 合并"来保证这一点。

3. **buildTool 模式降低认知负荷** — 每个工具都要声明 `isConcurrencySafe` 和 `interruptBehavior` 是很烦的。用默认值补全后，工具作者只关注自己不同的部分（读文件 safe + cancel，其他都是 unsafe + block）。

---

*本教程由 mini-cc 项目在完成第 2 课后自动生成。*
