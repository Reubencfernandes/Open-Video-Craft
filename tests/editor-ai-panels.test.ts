import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderKeysView } from "../src/shared/types";
import { AiConnectionDialog } from "../src/renderer/editor/AiConnectionDialog";
import { AssistantPanel } from "../src/renderer/editor/panels/AssistantPanel";
import { AudioPanel } from "../src/renderer/editor/panels/AudioPanel";
import { MusicPanel } from "../src/renderer/editor/panels/MusicPanel";
import { latestRelease } from "../src/renderer/home/latest-release";

const providerKeys: ProviderKeysView = {
  sttProvider: "whisper-local",
  hasCohereKey: false,
  hasGeminiKey: true,
  cohereLanguage: "en",
  encryptionAvailable: true
};

describe("editor AI and audio panels", () => {
  it("starts the Audio panel at Master volume without the live meter", () => {
    const html = renderToStaticMarkup(createElement(AudioPanel, {
      masterVolume: 100,
      audioSources: [],
      audioLevels: {},
      onMasterVolumeChange: () => undefined,
      onAddBackgroundMusic: () => undefined,
      onSelectItem: () => undefined,
      onSetAudioLevel: () => undefined
    }));

    expect(html).toContain("Master volume");
    expect(html).toContain("accent-violet-400");
    expect(html).not.toContain("transition-[width]");
  });

  it("offers only Lyria engines and defaults to Lyria Clip", () => {
    const html = renderToStaticMarkup(createElement(MusicPanel, {
      generationState: "idle",
      progress: null,
      lastLyrics: null,
      providerKeys,
      onGenerate: () => undefined,
      onCancel: () => undefined,
      onOpenAiSettings: () => undefined
    }));

    expect(html).toContain("Lyria 3 Clip (cloud)");
    expect(html).toContain("Lyria 3 Pro (cloud)");
    expect(html.match(/<option/g)).toHaveLength(2);
    expect(html).not.toMatch(/ACE-Step|Get Python|Duration \(s\)|Seed \(blank/);
    expect(latestRelease.changes.join(" ")).not.toMatch(/ACE-Step/i);
  });

  it("keeps Gemini actions disabled while provider settings load", () => {
    const musicHtml = renderToStaticMarkup(createElement(MusicPanel, {
      generationState: "idle",
      progress: null,
      lastLyrics: null,
      providerKeys: null,
      onGenerate: () => undefined,
      onCancel: () => undefined,
      onOpenAiSettings: () => undefined
    }));
    const assistantHtml = renderToStaticMarkup(createElement(AssistantPanel, {
      projectId: "project-1",
      providerKeys: null,
      messages: [],
      sending: false,
      statusMessage: null,
      chatError: null,
      includeVideo: false,
      videoConsent: false,
      onIncludeVideoChange: () => undefined,
      onVideoConsentChange: () => undefined,
      onSend: () => undefined,
      onCancel: () => undefined,
      onReset: () => undefined,
      onUndoEdit: () => undefined,
      onOpenAiSettings: () => undefined
    }));

    expect(musicHtml).toContain("Loading Gemini settings…");
    expect(musicHtml).toMatch(/<button[^>]*disabled=""/);
    expect(assistantHtml).toContain("Loading Gemini settings…");
    expect(assistantHtml).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("pins the assistant composer and scrolls only the message thread", () => {
    const html = renderToStaticMarkup(createElement(AssistantPanel, {
      projectId: "project-1",
      providerKeys,
      messages: [{
        id: "message-1",
        role: "assistant",
        text: "A-very-long-token-that-must-wrap-without-growing-the-panel",
        editSummary: null,
        editId: null
      }],
      sending: false,
      statusMessage: null,
      chatError: "Request failed",
      includeVideo: false,
      videoConsent: false,
      onIncludeVideoChange: () => undefined,
      onVideoConsentChange: () => undefined,
      onSend: () => undefined,
      onCancel: () => undefined,
      onReset: () => undefined,
      onUndoEdit: () => undefined,
      onOpenAiSettings: () => undefined
    }));

    expect(html).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("bg-rose-500/10");
    expect(html).not.toContain("bg-red-500/10");
  });

  it("omits project revision text and bounds the AI dialog to the viewport", () => {
    const html = renderToStaticMarkup(createElement(AiConnectionDialog, {
      open: true,
      lastAgentEdit: null,
      onClose: () => undefined,
      onUndo: async () => undefined,
      onProviderKeysChanged: () => undefined
    }));

    expect(html).toContain("AI video editing");
    expect(html).toContain("max-h-[calc(100dvh-2rem)]");
    expect(html).not.toMatch(/Project revision|Codex/);
  });
});
