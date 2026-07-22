import type { SttProviderId } from "../../shared/types";

const providerNames: Record<SttProviderId, string> = {
  "whisper-local": "Whisper",
  cohere: "Cohere",
  gemini: "Gemini"
};

/** Remove Electron IPC wrappers and raw provider payloads from transcription errors. */
export function formatSpeechToTextError(
  error: unknown,
  provider: SttProviderId
): string {
  const providerName = providerNames[provider];
  let message = error instanceof Error ? error.message : String(error);
  message = message
    .replace(/^Speech-to-text failed:\s*/i, "")
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  const normalized = message.toLowerCase();
  if (/http\s*503|\bcode["']?\s*:\s*503\b|\bunavailable\b|high demand/.test(normalized)) {
    return `${providerName} is temporarily unavailable because of high demand. Wait a moment and try again.`;
  }
  if (/http\s*429|rate limit|resource_exhausted/.test(normalized)) {
    return `${providerName}'s rate limit has been reached. Wait a moment and try again.`;
  }
  if (/rejected the api key|http\s*(401|403)|invalid api key/.test(normalized)) {
    return `${providerName} rejected the API key. Check it in AI settings and try again.`;
  }
  if (/aborterror|operation was aborted|request was cancelled|request was canceled/.test(normalized)) {
    return `${providerName} transcription was stopped.`;
  }
  if (/failed to fetch|network error|network request failed|econnreset|enotfound/.test(normalized)) {
    return `${providerName} could not be reached. Check your internet connection and try again.`;
  }
  if (/out of memory|allocation failed|memory access out of bounds/.test(normalized)) {
    return "Whisper ran out of memory while processing this recording. Try a shorter recording or a cloud model.";
  }

  const status = message.match(/HTTP\s*(\d{3})/i)?.[1];
  if (status) {
    return `${providerName} couldn't complete the transcription (HTTP ${status}). Please try again.`;
  }

  const withoutPayload = message.replace(/\s*\{[\s\S]*$/, "").trim();
  return withoutPayload || `${providerName} couldn't complete the transcription. Please try again.`;
}
