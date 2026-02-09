type OpenAIResponseJSON = Record<string, unknown>;

/**
 * Minimal OpenAI client using the Responses API.
 * Uses text.format for JSON output + input_text for message parts.
 */
export async function openaiGenerateJSON<T extends OpenAIResponseJSON>(opts: {
  model?: string;
  system: string;
  input: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = opts.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const max_output_tokens = Math.max(128, Math.min(1200, opts.maxOutputTokens ?? 700));

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens,

      // ✅ Responses API: output formatting (json_object / json_schema / text)
      text: {
        format: { type: "json_object" },
      },

      // ✅ Responses API: content part types are input_text / input_image / etc.
      input: [
        { role: "system", content: [{ type: "input_text", text: opts.system }] },
        { role: "user", content: [{ type: "input_text", text: opts.input }] },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as any;

  // Usually present convenience field
  const contentText =
    (typeof json?.output_text === "string" && json.output_text) ||
    (typeof json?.output?.[0]?.content?.[0]?.text === "string" && json.output[0].content[0].text) ||
    "";

  if (!contentText) throw new Error("OpenAI: missing output text");

  try {
    return JSON.parse(contentText) as T;
  } catch {
    // Best-effort extraction if any stray chars
    const start = contentText.indexOf("{");
    const end = contentText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(contentText.slice(start, end + 1)) as T;
    }
    throw new Error("OpenAI: invalid JSON output");
  }
}
