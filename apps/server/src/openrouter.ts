export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  demo: boolean;
}

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function hasOpenRouterKey(): boolean {
  const key = env("OPENROUTER_API_KEY");
  return Boolean(key) && !key.includes("your-key-here");
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number },
): Promise<OpenRouterResult> {
  if (!hasOpenRouterKey()) {
    return {
      content: demoResponse(messages),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      demo: true,
    };
  }

  const model = options?.model || env("OPENROUTER_MODEL", "openai/gpt-4o-mini");
  const body = JSON.stringify({
    model,
    temperature: options?.temperature ?? 0.4,
    messages,
  });

  let lastError = "OpenRouter request failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env("OPENROUTER_SITE_URL", "http://localhost:5173"),
        "X-Title": env("OPENROUTER_APP_NAME", "Agent Grove"),
      },
      body,
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("OpenRouter returned an empty response");

      return {
        content,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        demo: false,
      };
    }

    const text = await response.text();
    lastError = `OpenRouter ${response.status}: ${text.slice(0, 400)}`;
    if (![429, 502, 503].includes(response.status) || attempt === 3) {
      throw new Error(lastError);
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    const waitMs = Math.max(retryAfter * 1000, 1500 * (attempt + 1));
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(lastError);
}

function demoResponse(messages: ChatMessage[]): string {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const system = messages.find((m) => m.role === "system")?.content ?? "";

  if (system.includes("Planner")) {
    return JSON.stringify(
      {
        tasks: [
          { agent: "scout", title: "Gather sources and key facts" },
          { agent: "analyst", title: "Compare options and recommend" },
          { agent: "inspector", title: "Verify evidence completeness" },
          { agent: "scribe", title: "Write the final report" },
        ],
      },
      null,
      2,
    );
  }

  if (system.includes("Scout")) {
    return JSON.stringify(
      {
        findings: [
          {
            name: "Cursor",
            summary: "AI-native IDE with strong agent workflows for developers.",
            url: "https://cursor.com",
            notes: "Popular among student and indie developers.",
          },
          {
            name: "Claude Code",
            summary: "Terminal-first coding agent with deep repo tooling.",
            url: "https://docs.anthropic.com/en/docs/claude-code",
            notes: "Strong for local codebase work.",
          },
          {
            name: "GitHub Copilot",
            summary: "Widely available coding assistant integrated into GitHub/VS Code.",
            url: "https://github.com/features/copilot",
            notes: "Familiar option with student pricing paths.",
          },
        ],
      },
      null,
      2,
    );
  }

  if (system.includes("Analyst")) {
    return JSON.stringify(
      {
        comparison: [
          { name: "Cursor", score: 9, reason: "Best end-to-end agent UX for building apps" },
          { name: "Claude Code", score: 8, reason: "Excellent for terminal/repo workflows" },
          { name: "GitHub Copilot", score: 7, reason: "Broad access and ecosystem support" },
        ],
        recommendation: "Cursor for a student who wants a visual agent workspace; Claude Code if they live in the terminal.",
      },
      null,
      2,
    );
  }

  if (system.includes("Inspector")) {
    return JSON.stringify(
      {
        ok: true,
        issues: [],
        notes: "Demo mode: evidence is illustrative. Add OPENROUTER_API_KEY for live research.",
      },
      null,
      2,
    );
  }

  // Scribe
  return `# Research Report

## Mission
${extractMission(user)}

## Summary
This is a **demo-mode** report generated without an OpenRouter API key. The office workflow still ran end-to-end so you can test the product.

## Findings
1. **Cursor** — Strong AI IDE for building with agents.
2. **Claude Code** — Powerful terminal coding agent.
3. **GitHub Copilot** — Accessible, ecosystem-backed assistant.

## Recommendation
Start with **Cursor** if you want a visual workspace; use **Claude Code** for deep CLI work.

## Next steps
1. Add your \`OPENROUTER_API_KEY\` to \`.env\`
2. Re-run this mission for live model output
3. Export and share the report from Agent Grove

---
_Generated by Agent Grove (demo mode)_
`;
}

function extractMission(userContent: string): string {
  try {
    const parsed = JSON.parse(userContent) as { mission?: string; prompt?: string };
    return parsed.mission || parsed.prompt || userContent.slice(0, 200);
  } catch {
    return userContent.slice(0, 200);
  }
}
