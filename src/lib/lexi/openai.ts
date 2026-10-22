export type LexiChatTurn = { role: "system" | "user" | "assistant"; content: string };

export function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export async function lexiChatCompletion(input: {
  messages: LexiChatTurn[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.LEXI_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.6,
      max_tokens: input.maxTokens ?? 1200,
      messages: input.messages,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      `OpenAI error (${res.status})`;
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("Lexi returned an empty response.");
  }
  return text.trim();
}
