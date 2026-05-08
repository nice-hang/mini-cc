import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const execAsync = promisify(exec);

export const bashTool: AgentTool<any> = {
  name: "bash",
  label: "Bash",
  description: "Execute a shell command. Use this to run code, scripts, or system commands.",
  parameters: Type.Object({
    command: Type.String({ description: "Shell command to execute" }),
    description: Type.Optional(Type.String({ description: "What this command does" })),
  }),
  execute: async (_id, params: any) => {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const parts: string[] = [];
      if (stdout) parts.push(stdout);
      if (stderr) parts.push(`STDERR:\n${stderr}`);
      return { content: [{ type: "text", text: parts.join("\n") || "(no output)" }], details: { exitCode: 0 } };
    } catch (err: any) {
      const stderr = err.stderr || "";
      const stdout = err.stdout || "";
      const text = [stdout, stderr].filter(Boolean).join("\n") || err.message;
      return { content: [{ type: "text", text }], details: { exitCode: err.code ?? 1 }, isError: true };
    }
  },
};
