import { Agent } from "@mariozechner/pi-agent-core";
import type { TextContent, ThinkingContent } from "@mariozechner/pi-ai";
import { getModel, getEnvApiKey } from "@mariozechner/pi-ai";
import { loadConfig } from "./config.js";
import { buildTools, buildSystemPrompt } from "./tools/index.js";
import { loadSkillsMeta } from "./skills/loader.js";
import { startRepl } from "./cli/repl.js";
import { createTracer } from "pi-tracing";

async function main() {
  // 解析 -m 参数：单次消息模式，不走交互 REPL
  const args = process.argv.slice(2);
  let message = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" && i + 1 < args.length) message = args[++i];
  }

  // 加载配置、API key、模型
  const config = loadConfig();
  const apiKey = config.apiKey || getEnvApiKey(config.provider);
  const model = getModel(config.provider as never, config.model as never);
  if (!model) { console.error(`Unknown model: ${config.provider}/${config.model}`); process.exit(1); }

  // 扫描 skills、构建 Agent
  const skills = await loadSkillsMeta();
  const agent = new Agent({
    initialState: { model, systemPrompt: buildSystemPrompt(skills), tools: buildTools(skills) },
    getApiKey: () => apiKey,
  });

  // 启动 pi-tracing 仪表盘（http://localhost:3333）
  const tracer = createTracer(agent);
  tracer.serve();

  // 单次模式：订阅事件流，增量输出到 stdout
  if (message) {
    let text = "", thinking = false;
    agent.subscribe((ev: any) => {
      if (ev.type === "message_end") { process.stdout.write("\n"); return; }
      if (ev.type !== "message_start" && ev.type !== "message_update") return;
      if (ev.message?.role !== "assistant") return;
      const content = ev.message.content;
      // string 类型的 content 是纯文本增量
      if (typeof content === "string") { const d = content.slice(text.length); if (d) { process.stdout.write(d); text = content; } }
      if (!Array.isArray(content)) return;
      // thinking 块用 dim 色显示，仅首次输出
      for (const b of content) {
        if (b.type === "thinking" && !thinking) { process.stdout.write(`\x1b[2m${b.thinking}\x1b[22m\n`); thinking = true; }
      }
      const t = content.filter((c: any): c is TextContent => c.type === "text").map((c) => c.text).join("");
      const d = t.slice(text.length);
      if (d) { process.stdout.write(d); text = t; }
    });
    await agent.prompt(message);
    await agent.waitForIdle();
    process.exit(0);
  }

  // 交互模式：启动 pi-tui REPL
  startRepl(agent, config, skills);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
