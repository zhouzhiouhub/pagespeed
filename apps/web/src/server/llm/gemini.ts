import { proxiedFetch } from "@/server/http/fetch";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";

applyProxyDispatcher();

export type LlmJsonResult = {
  text: string;
  model: string;
};

function requireKey(): string {
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) throw new Error("LLM_API_KEY is not configured");
  return key;
}

function modelName(): string {
  return (process.env.LLM_MODEL?.trim() || "gemini-2.5-flash").replace(
    /^models\//,
    "",
  );
}

/**
 * Call Gemini generateContent and return raw text.
 * Official API; LLM_BASE_URL unused unless set as full override host.
 */
export async function generateText(prompt: string): Promise<LlmJsonResult> {
  const key = requireKey();
  const model = modelName();
  const base =
    process.env.LLM_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://generativelanguage.googleapis.com";
  const endpoint = `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const response = await proxiedFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `Gemini failed (${response.status})`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned empty content");
  return { text, model };
}

export function safeParseJsonArray<T>(text: string): T[] {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (Array.isArray(parsed)) return parsed as T[];
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { items?: unknown }).items)
  ) {
    return (parsed as { items: T[] }).items;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { opportunities?: unknown }).opportunities)
  ) {
    return (parsed as { opportunities: T[] }).opportunities;
  }
  throw new Error("LLM JSON is not an array");
}
