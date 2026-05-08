import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const webSearchTool: AgentTool<any> = {
  name: "web_search",
  label: "Web Search",
  description: "Search the web for information. Returns relevant snippets and URLs.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
  }),
  execute: async (_id, params: any) => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(params.query)}`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
      });
      const html = await response.text();
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);
      return { content: [{ type: "text", text }], details: {} };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Search failed: ${err.message}` }], details: {}, isError: true };
    }
  },
};
