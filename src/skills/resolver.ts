import type { SkillMeta } from "./loader.js";

/** Build a system prompt section listing available skills (progressive disclosure). */
export function buildSkillsPrompt(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";

  const lines = skills.map(
    (s) => `- \`${s.name}\`: ${s.description || "(no description)"}`,
  );

  return [
    "",
    "Available Skills:",
    ...lines,
    "",
    'When a skill\'s description matches the user\'s request, call `read_skill` to load its full instructions.',
    "---",
  ].join("\n");
}
