import { TUI, ProcessTerminal, Editor, Markdown, Container, CombinedAutocompleteProvider } from "@mariozechner/pi-tui";
import type { EditorTheme, MarkdownTheme } from "@mariozechner/pi-tui";
import type { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { SkillMeta } from "../skills/loader.js";
import type { Config } from "../config.js";

// ANSI 样式辅助函数
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;    // 灰色/暗淡
const cy = (s: string) => `\x1b[36m${s}\x1b[39m`;    // 青色
const bd = (s: string) => `\x1b[1m${s}\x1b[22m`;     // 加粗

// Editor 主题：青色边框 + 自动补全列表样式
const eTheme: EditorTheme = {
  borderColor: cy,
  selectList: { selectedPrefix: (s) => `\x1b[36m› ${s}\x1b[39m`, selectedText: bd, description: dim, scrollInfo: dim, noMatch: (s) => `\x1b[31m${s}\x1b[39m` },
};

// Markdown 渲染主题：标题/链接/代码/引用等各元素配色
const mTheme: MarkdownTheme = {
  heading: (s) => `\x1b[1;36m${s}\x1b[22;39m`, link: (s) => `\x1b[34;4m${s}\x1b[24;39m`,
  linkUrl: (s) => `\x1b[34m${s}\x1b[39m`, code: (s) => `\x1b[33m${s}\x1b[39m`, codeBlock: (s) => s, codeBlockBorder: dim,
  quote: dim, quoteBorder: (s) => dim(`│${s}`), hr: dim, listBullet: cy, bold: bd,
  italic: (s) => `\x1b[3m${s}\x1b[23m`, strikethrough: (s) => `\x1b[9m${s}\x1b[29m`, underline: (s) => `\x1b[4m${s}\x1b[24m`,
  codeBlockIndent: "  ",
};

export function startRepl(agent: Agent, config: Config, skills: SkillMeta[]) {
  // TUI 布局：上方消息列表 + 底部输入编辑器
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const msgs = new Container();
  const editor = new Editor(tui, eTheme);

  msgs.addChild(new Markdown("Mini-Claw interactive mode. Type `/help` for commands.", 2, 0, mTheme));
  tui.addChild(msgs);
  tui.addChild(editor);
  tui.setFocus(editor);

  // 斜杠命令自动补全
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(
      [
        { name: "/help", description: "Show help" },
        { name: "/skills", description: "List skills" },
        { name: "/new", description: "Clear conversation" },
        { name: "/model", description: "Show/switch model", argumentHint: "<id>" },
        { name: "/exit", description: "Quit" },
      ],
      "",
    ),
  );

  // busy 标记防止重复提交
  let busy = false;

  editor.onSubmit = (text) => {
    if (!text.trim()) return;
    handleInput(text.trim());
  };

  async function handleInput(input: string) {
    // 斜杠命令直接走命令处理器，不阻塞
    if (input.startsWith("/")) {
      await handleCmd(input);
      return;
    }
    if (busy) return;
    busy = true;
    editor.disableSubmit = true;

    // 显示用户消息（blockquote 样式）和空的助手回复占位
    msgs.addChild(new Markdown(`> ${input}`, 2, 0, mTheme));
    const reply = new Markdown("", 2, 0, mTheme);
    msgs.addChild(reply);
    tui.requestRender();

    // 订阅 Agent 事件流，增量更新 Markdown 内容
    let buf = "";
    const unsub = agent.subscribe((ev: any) => {
      if ((ev.type === "message_start" || ev.type === "message_update") && ev.message?.role === "assistant") {
        const c = ev.message.content;
        let text = "";
        if (typeof c === "string") text = c;
        else if (Array.isArray(c)) {
          // thinking 块转为 blockquote，text 块保留原样
          text = c.map((b: any) => b.type === "thinking" ? `> ${b.thinking}\n` : b.type === "text" ? b.text : "").join("");
        }
        if (text !== buf) { buf = text; reply.setText(text); tui.requestRender(); }
      }
    });

    try {
      await agent.prompt(input);
      await agent.waitForIdle();
    } catch (err: any) {
      if (err.name !== "AbortError") { reply.setText(`**Error:** ${err.message}`); tui.requestRender(); }
    } finally {
      unsub();
      busy = false;
      editor.disableSubmit = false;
    }
  }

  // 斜杠命令处理
  async function handleCmd(input: string) {
    const [cmd, ...args] = input.split(/\s+/);
    const say = (text: string) => { msgs.addChild(new Markdown(text, 2, 0, mTheme)); tui.requestRender(); };

    switch (cmd!.toLowerCase()) {
      case "/help":
        say("**Commands:**\n- `/help` — Show help\n- `/skills` — List skills\n- `/new` — Clear conversation\n- `/model` — Show model\n- `/model <id>` — Switch model\n- `/exit` — Quit");
        break;
      case "/skills":
        say(skills.length === 0 ? "No skills loaded." : "**Skills:**\n" + skills.map((s) => `- **${s.name}**: ${s.description}`).join("\n"));
        break;
      case "/new":
        msgs.clear();
        agent.reset();
        tui.requestRender();
        break;
      case "/model":
        if (args[0]) {
          try {
            const m = getModel(config.provider as never, args[0] as never);
            if (!m) { say(`Unknown model: ${args[0]}`); break; }
            agent.state.model = m;
            agent.reset();
            msgs.clear();
            say(`Switched to **${args[0]}**`);
          } catch { say(`Unknown model: ${args[0]}`); }
        } else {
          say(`Current model: **${agent.state.model.id}**`);
        }
        break;
      case "/exit":
        tui.stop();
        process.exit(0);
      default:
        say(`Unknown command: \`${cmd}\`. Type /help for commands.`);
    }
  }

  // Ctrl+C：忙时取消当前请求，闲时退出
  tui.addInputListener((data): { consume?: boolean } | undefined => {
    if (data === "\x03") { if (busy) agent.abort(); else { tui.stop(); process.exit(0); } }
    return undefined;
  });

  tui.start();
}
