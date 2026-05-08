import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const webFetchTool: AgentTool<any> = {
  name: "web_fetch",
  label: "Web Fetch",
  description: "Fetch content from a URL. Returns the page text content.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to fetch" }),
  }),
  execute: async (_id, params: any) => {
    try {
      const response = await fetch(params.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const html = await response.text();
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000);
      return { content: [{ type: "text", text }], details: { status: response.status } };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Fetch failed: ${err.message}` }], details: {}, isError: true };
    }
  },
};
