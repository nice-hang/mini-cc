import { readdir } from "node:fs/promises";
import { statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const listDirectoryTool: AgentTool<any> = {
  name: "list_directory",
  label: "List Directory",
  description: "List files and directories in a directory. Shows names, types, and sizes.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the directory" }),
  }),
  execute: async (_id, params: any) => {
    const entries = await readdir(params.path);
    const lines = entries.map((name) => {
      const full = join(params.path, name);
      try {
        const s = statSync(full);
        const type = s.isDirectory() ? "dir" : "file";
        const size = s.isDirectory() ? "" : ` ${s.size}B`;
        return `${name.padEnd(30)} ${type}${size}`;
      } catch {
        return `${name.padEnd(30)} ?`;
      }
    });
    return { content: [{ type: "text", text: lines.join("\n") || "(empty directory)" }], details: {} };
  },
};
