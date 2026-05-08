import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  provider: string;
  model: string;
  apiKey?: string;
}

export function loadConfig(): Config {
  const paths = [
    join(process.cwd(), "config.json"),
    join(homedir(), ".mini-claw", "config.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8")) as Config;
    }
  }

  // Fallback defaults
  return {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
  };
}
