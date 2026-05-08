import { writeFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const writeFileTool: AgentTool<any> = {
  name: "write_file",
  label: "Write File",
  description: "Write content to a file. Creates the file if it doesn't exist. Overwrites existing content.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the file" }),
    content: Type.String({ description: "Content to write" }),
  }),
  execute: async (_id, params: any) => {
    await writeFile(params.path, params.content, "utf-8");
    return { content: [{ type: "text", text: `Written to ${params.path}` }], details: {} };
  },
};
