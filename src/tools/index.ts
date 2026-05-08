import type { AgentTool } from "@mariozechner/pi-agent-core";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { listDirectoryTool } from "./list-directory.js";
import { bashTool } from "./bash.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { createReadSkillTool } from "../skills/loader.js";
import { buildSkillsPrompt } from "../skills/resolver.js";
import type { SkillMeta } from "../skills/loader.js";

export function buildTools(skills: SkillMeta[]): AgentTool<any>[] {
  const base = [
    readFileTool,
    writeFileTool,
    editFileTool,
    listDirectoryTool,
    bashTool,
    webSearchTool,
    webFetchTool,
  ];

  // Only add read_skill if there are skills available
  if (skills.length > 0) {
    base.push(createReadSkillTool());
  }

  return base;
}

export function buildSystemPrompt(skills: SkillMeta[]): string {
  const toolLines = [
    readFileTool,
    writeFileTool,
    editFileTool,
    listDirectoryTool,
    bashTool,
    webSearchTool,
    webFetchTool,
  ]
    .map((t) => `- \`${t.name}\`: ${t.description.split(".")[0]!.trim()}`)
    .join("\n");

  const parts = [
    "You are a helpful AI assistant with access to tools.",
    "",
    "Available tools:",
    toolLines,
    "",
    "Use the appropriate tool when needed. For file operations, always use absolute paths.",
    "When the user asks you to create or modify code, you can read the current files, make changes, and verify results.",
  ];

  const skillsPrompt = buildSkillsPrompt(skills);
  if (skillsPrompt) parts.push("", skillsPrompt);

  return parts.join("\n");
}
