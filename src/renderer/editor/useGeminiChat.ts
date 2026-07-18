/**
 * Chat state for the built-in Gemini editing assistant. All model calls and
 * edits happen in the main process; this hook mirrors the message history and
 * streams status updates ("analyzing", "applying edit…") for the panel.
 */
import { useEffect, useState } from "react";
import type { GeminiChatMessage, GeminiChatUpdateEvent } from "../../shared/types";

export function useGeminiChat(params: { projectId: string | null }) {
  const { projectId } = params;
  const [messages, setMessages] = useState<GeminiChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [videoConsent, setVideoConsent] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void window.openVideoCraft.gemini
      .getHistory(projectId)
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch(() => undefined);

    const unsubscribe = window.openVideoCraft.gemini.onUpdate(
      (event: GeminiChatUpdateEvent) => {
        if (event.projectId !== projectId) return;
        setStatusMessage(describeStatus(event));
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!projectId || !trimmed || sending) return;
    setSending(true);
    setChatError(null);
    setMessages((current) => [
      ...current,
      { id: `pending-${Date.now()}`, role: "user", text: trimmed, editSummary: null, editId: null }
    ]);

    try {
      const history = await window.openVideoCraft.gemini.send({
        projectId,
        message: trimmed,
        includeVideo: includeVideo && videoConsent
      });
      setMessages(history);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
      // Re-sync with the authoritative main-process history.
      void window.openVideoCraft.gemini.getHistory(projectId).then(setMessages).catch(() => undefined);
    } finally {
      setSending(false);
      setStatusMessage(null);
    }
  }

  function cancel() {
    if (projectId) void window.openVideoCraft.gemini.cancel(projectId);
  }

  async function reset() {
    if (!projectId) return;
    await window.openVideoCraft.gemini.reset(projectId).catch(() => undefined);
    setMessages([]);
    setChatError(null);
  }

  return {
    cancel,
    chatError,
    includeVideo,
    messages,
    reset,
    send,
    sending,
    setIncludeVideo,
    setVideoConsent,
    statusMessage,
    videoConsent
  };
}

function describeStatus(event: GeminiChatUpdateEvent): string | null {
  switch (event.status) {
    case "thinking":
      return "Thinking…";
    case "inspecting":
      return "Reading the project…";
    case "analyzing":
      return event.message ?? "Analyzing the recording…";
    case "applying-edit":
      return event.message ?? "Applying the edit…";
    case "uploading-video":
      return event.message ?? "Uploading the video…";
    default:
      return null;
  }
}
