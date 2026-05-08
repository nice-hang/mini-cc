import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export interface SkillMeta {
  name: string;
  description: string;
  allowedTools?: string;
}

const SKILLS_DIR = join(homedir(), ".mini-claw", "skills");

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!content.startsWith("---")) return { meta, body: content };

  const end = content.indexOf("---", 3);
  if (end === -1) return { meta, body: content };

  for (const line of content.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  return { meta, body: content.slice(end + 3).trim() };
}

/** Scan ~/.mini-claw/skills/ and return metadata for all valid skills. */
export async function loadSkillsMeta(): Promise<SkillMeta[]> {
  if (!existsSync(SKILLS_DIR)) return [];

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills: SkillMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = await readFile(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);
      skills.push({
        name: meta.name || entry.name,
        description: meta.description || "",
        allowedTools: meta["allowed-tools"],
      });
    } catch {
      // skip invalid skills
    }
  }
  return skills;
}

/** Load the full body of a skill by directory name. Returns null if not found. */
export async function loadSkillBody(name: string): Promise<string | null> {
  if (!existsSync(SKILLS_DIR)) return null;

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name !== name) continue;
    const skillFile = join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) return null;

    try {
      const content = await readFile(skillFile, "utf-8");
      const { body } = parseFrontmatter(content);
      return body || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Build the `read_skill` tool for progressive disclosure. */
export function createReadSkillTool(): AgentTool<any> {
  return {
    name: "read_skill",
    label: "Read Skill",
    description:
      "Load the full instructions of a skill by name. Call this when a skill's description matches the user's request.",
    parameters: Type.Object({
      name: Type.String({ description: "Skill name to load" }),
    }),
    execute: async (_id, params: any) => {
      const body = await loadSkillBody(params.name);
      if (body) {
        return { content: [{ type: "text", text: body }], details: {} };
      }
      return {
        content: [{ type: "text", text: `Skill "${params.name}" not found.` }],
        details: {},
        isError: true,
      };
    },
  };
}
