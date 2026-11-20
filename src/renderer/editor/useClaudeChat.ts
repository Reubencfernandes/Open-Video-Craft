/** Chat state for the Claude Max assistant backed by the authenticated CLI. */
import { useEffect, useRef, useState } from "react";
import type { GeminiChatMessage } from "../../shared/types";

export function useClaudeChat(params: { projectId: string | null }) {
  const { projectId } = params;
  const [messages, setMessages] = useState<GeminiChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const activeRequestRef = useRef(0);
  const sendingRef = useRef(false);
  const previousProjectRef = useRef<string | null>(null);

  useEffect(() => {
    activeRequestRef.current += 1;
    sendingRef.current = false;
    setMessages([]);
    setSending(false);
    setStatusMessage(null);
    setChatError(null);

    const previousProjectId = previousProjectRef.current;
    if (previousProjectId !== null && previousProjectId !== projectId) {
      void window.openVideoCraft.claude.cancel(previousProjectId);
    }
    previousProjectRef.current = projectId;

    return () => {
      if (sendingRef.current && projectId !== null) {
        void window.openVideoCraft.claude.cancel(projectId);
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
    setStatusMessage("Claude Max is editing…");
    setMessages((current) => [
      ...current,
      {
        id: `claude-user-${Date.now()}`,
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
        editSummary: null,
        editId: null
      }
    ]);

    try {
      const result = await window.openVideoCraft.claude.send({
        projectId: requestProjectId,
        message: trimmed
      });
      if (activeRequestRef.current === requestId) {
        setMessages((current) => [
          ...current,
          {
            id: `claude-${Date.now()}`,
            role: "assistant",
            text: result.text,
            createdAt: Date.now(),
            editSummary: null,
            editId: null
          }
        ]);
      }
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setChatError(error instanceof Error ? error.message : String(error));
      setMessages((current) => current.slice(0, -1));
    } finally {
      if (activeRequestRef.current === requestId) {
        sendingRef.current = false;
        setSending(false);
        setStatusMessage(null);
      }
    }
  }

  function cancel() {
    activeRequestRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setStatusMessage(null);
    if (projectId) void window.openVideoCraft.claude.cancel(projectId);
  }

  function reset() {
    activeRequestRef.current += 1;
    sendingRef.current = false;
    setMessages([]);
    setSending(false);
    setStatusMessage(null);
    setChatError(null);
  }

  return { cancel, chatError, messages, reset, send, sending, statusMessage };
}
