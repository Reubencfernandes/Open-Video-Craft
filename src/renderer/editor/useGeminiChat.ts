/**
 * Chat state for the built-in Gemini editing assistant. All model calls and
 * edits happen in the main process; this hook mirrors the message history and
 * streams status updates ("analyzing", "applying edit…") for the panel.
 */
import { useEffect, useRef, useState } from "react";
import type { GeminiChatMessage, GeminiChatUpdateEvent } from "../../shared/types";

export function useGeminiChat(params: { projectId: string | null }) {
  const { projectId } = params;
  const [messages, setMessages] = useState<GeminiChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const activeRequestRef = useRef(0);
  const sendingRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  useEffect(() => {
    const projectGeneration = ++activeRequestRef.current;
    sendingRef.current = false;
    setMessages([]);
    setSending(false);
    setStatusMessage(null);
    setChatError(null);
    if (!projectId) return;
    let cancelled = false;
    void window.openVideoCraft.gemini
      .getHistory(projectId)
      .then((history) => {
        if (!cancelled && activeRequestRef.current === projectGeneration) {
          setMessages(history);
        }
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
      if (sendingRef.current) {
        // Project navigation and editor unmounts remove the request controls.
        // Stop only genuinely active work; completed sessions keep their
        // history and are not cancelled merely because the panel disappears.
        void window.openVideoCraft.gemini.cancel(projectId).catch(() => undefined);
      }
    };
  }, [projectId]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!projectId || !trimmed || sendingRef.current) return;
    const requestProjectId = projectId;
    const requestId = ++activeRequestRef.current;
    sendingRef.current = true;
    setSending(true);
    setChatError(null);
    setMessages((current) => [
      ...current,
      {
        id: `pending-${Date.now()}`,
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
        editSummary: null,
        editId: null
      }
    ]);

    try {
      const history = await window.openVideoCraft.gemini.send({
        projectId: requestProjectId,
        message: trimmed,
        includeVideo: true
      });
      if (
        activeRequestRef.current === requestId &&
        projectIdRef.current === requestProjectId
      ) {
        setMessages(history);
      }
    } catch (error) {
      if (
        activeRequestRef.current !== requestId ||
        projectIdRef.current !== requestProjectId
      ) {
        return;
      }
      setChatError(error instanceof Error ? error.message : String(error));
      // Re-sync with the authoritative main-process history.
      void window.openVideoCraft.gemini
        .getHistory(requestProjectId)
        .then((history) => {
          if (
            activeRequestRef.current === requestId &&
            projectIdRef.current === requestProjectId
          ) {
            setMessages(history);
          }
        })
        .catch(() => undefined);
    } finally {
      if (
        activeRequestRef.current === requestId &&
        projectIdRef.current === requestProjectId
      ) {
        sendingRef.current = false;
        setSending(false);
        setStatusMessage(null);
      }
    }
  }

  function cancel() {
    if (projectId) void window.openVideoCraft.gemini.cancel(projectId);
  }

  async function reset() {
    if (!projectId) return;
    const resetProjectId = projectId;
    const resetId = ++activeRequestRef.current;
    sendingRef.current = false;
    setMessages([]);
    setSending(false);
    setStatusMessage(null);
    setChatError(null);
    await window.openVideoCraft.gemini.reset(resetProjectId).catch(() => undefined);
    if (activeRequestRef.current !== resetId || projectIdRef.current !== resetProjectId) return;
  }

  return {
    cancel,
    chatError,
    messages,
    reset,
    send,
    sending,
    statusMessage
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
