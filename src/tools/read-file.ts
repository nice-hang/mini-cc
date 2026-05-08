import { readFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const readFileTool: AgentTool<any> = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file at the given path.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the file" }),
  }),
  execute: async (_id, params: any) => {
    const content = await readFile(params.path, "utf-8");
    return { content: [{ type: "text", text: content }], details: {} };
  },
};
