/**
 * Lyria 3 music generation through the Gemini API Interactions endpoint.
 * Clip (`lyria-3-clip-preview`) always returns a 30 s MP3; Pro
 * (`lyria-3-pro-preview`) generates full songs whose length is steered by the
 * prompt. Responses interleave text (lyrics / structure) and base64 audio
 * blocks inside `steps[].content[]`.
 */

export type LyriaModel = "lyria-3-clip-preview" | "lyria-3-pro-preview";

export interface LyriaGenerationOutput {
  audio: Buffer;
  mimeType: string;
  lyrics: string | null;
}

interface LyriaContentBlock {
  type?: string;
  data?: string;
  text?: string;
  mime_type?: string;
  mimeType?: string;
}

interface LyriaInteractionResponse {
  steps?: Array<{ type?: string; content?: LyriaContentBlock[] }>;
  error?: { message?: string };
}

export function buildLyriaPrompt(prompt: string, lyrics: string): string {
  const trimmedLyrics = lyrics.trim();
  if (!trimmedLyrics) {
    return prompt;
  }
  return `${prompt}\n\nUse the following lyrics:\n\n${trimmedLyrics}`;
}

/** Extracts audio + lyrics from a Lyria Interactions response body. */
export function parseLyriaResponse(body: LyriaInteractionResponse): LyriaGenerationOutput {
  const lyrics: string[] = [];
  let audio: Buffer | null = null;
  let mimeType = "audio/mpeg";

  for (const step of body.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "audio" && typeof block.data === "string") {
        audio = Buffer.from(block.data, "base64");
        mimeType = block.mime_type ?? block.mimeType ?? mimeType;
      } else if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        lyrics.push(block.text.trim());
      }
    }
  }

  if (!audio || audio.length === 0) {
    throw new Error(
      body.error?.message ??
        "Lyria returned no audio. The prompt may have been blocked by safety filters."
    );
  }

  return { audio, mimeType, lyrics: lyrics.length > 0 ? lyrics.join("\n\n") : null };
}

export async function generateLyria(input: {
  model: LyriaModel;
  prompt: string;
  lyrics: string;
  apiKey: string;
  signal: AbortSignal;
}): Promise<LyriaGenerationOutput> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": input.apiKey,
      "Content-Type": "application/json"
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      input: buildLyriaPrompt(input.prompt, input.lyrics)
    })
  });

  if (!response.ok) {
    const detail = await response.text().then((text) => text.slice(0, 300)).catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gemini rejected the API key. Check it in the AI settings.");
    }
    if (response.status === 429) {
      throw new Error("Gemini rate limit reached. Wait a moment and try again.");
    }
    throw new Error(`Lyria generation failed (HTTP ${response.status}). ${detail}`.trim());
  }

  return parseLyriaResponse((await response.json()) as LyriaInteractionResponse);
}
