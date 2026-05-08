import { readFile, writeFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const editFileTool: AgentTool<any> = {
  name: "edit_file",
  label: "Edit File",
  description:
    "Find and replace exact text in a file. Use this to make targeted edits without rewriting the entire file.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the file" }),
    old_string: Type.String({ description: "Exact text to replace" }),
    new_string: Type.String({ description: "Text to insert in place of old_string" }),
    replace_all: Type.Optional(Type.Boolean({ description: "Replace all occurrences if true" })),
  }),
  execute: async (_id, params: any) => {
    const content = await readFile(params.path, "utf-8");
    if (params.replace_all) {
      if (!content.includes(params.old_string)) {
        return {
          content: [{ type: "text", text: `Error: old_string not found in ${params.path}` }],
          details: {},
          isError: true,
        };
      }
      const updated = content.replaceAll(params.old_string, params.new_string);
      await writeFile(params.path, updated, "utf-8");
    } else {
      const idx = content.indexOf(params.old_string);
      if (idx === -1) {
        return {
          content: [{ type: "text", text: `Error: old_string not found in ${params.path}` }],
          details: {},
          isError: true,
        };
      }
      const updated = content.slice(0, idx) + params.new_string + content.slice(idx + params.old_string.length);
      await writeFile(params.path, updated, "utf-8");
    }
    return { content: [{ type: "text", text: `Edited ${params.path}` }], details: {} };
  },
};
