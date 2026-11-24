/**
 * Which engine drives the editing assistant (remembered per user), and
 * whether the user's Claude Code CLI is available to drive it.
 */
import { useEffect, useState } from "react";
import type { AssistantEngine } from "../../shared/types";
import type { ClaudeAvailability } from "./panels/AssistantPanel";

export const assistantEngineStorageKey = "open-video-craft:assistant-engine";

export function readAssistantEngine(storage: Pick<Storage, "getItem"> | null): AssistantEngine {
  try {
    return storage?.getItem(assistantEngineStorageKey) === "gemini" ? "gemini" : "claude";
  } catch {
    return "claude";
  }
}

export function useAssistantEngine(panelOpen: boolean) {
  const [engine, setEngineState] = useState<AssistantEngine>(() =>
    readAssistantEngine(typeof window === "undefined" ? null : window.localStorage)
  );
  const [claudeAvailability, setClaudeAvailability] = useState<ClaudeAvailability>("checking");

  // Check each time the panel opens with Claude selected, so installing or
  // signing in to Claude Code takes effect without restarting the app.
  useEffect(() => {
    if (!panelOpen || engine !== "claude") return undefined;
    let cancelled = false;
    setClaudeAvailability((current) => (current === "available" ? current : "checking"));
    window.openVideoCraft.ai.getStatus()
      .then((status) => {
        const claude = status.providers.find((provider) => provider.provider === "claude");
        if (!cancelled) setClaudeAvailability(claude?.installed ? "available" : "missing");
      })
      .catch(() => {
        if (!cancelled) setClaudeAvailability("missing");
      });
    return () => { cancelled = true; };
  }, [engine, panelOpen]);

  function setEngine(next: AssistantEngine) {
    setEngineState(next);
    try {
      window.localStorage.setItem(assistantEngineStorageKey, next);
    } catch {
      // Private windows may refuse storage; the choice still applies now.
    }
  }

  return { engine, setEngine, claudeAvailability };
}
