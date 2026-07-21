import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLibraryEntry } from "../src/shared/types";
import { HomeActionCard } from "../src/renderer/home/HomeActionCard";
import { HomeHeader } from "../src/renderer/home/HomeHeader";
import { ProjectArtwork } from "../src/renderer/home/ProjectArtwork";
import { RecentProjectsSection } from "../src/renderer/home/RecentProjectsSection";

const project: ProjectLibraryEntry = {
  id: "project-1",
  name: "Product walkthrough",
  rootPath: "/tmp/product-walkthrough",
  status: "complete",
  durationMs: 92_000,
  updatedAt: "2026-07-20T12:00:00.000Z",
  mediaAvailability: { screen: true, camera: true, audio: true },
  available: true,
  thumbnailUrl: null
};

describe("home dashboard", () => {
  it("renders a compact searchable project header", () => {
    const html = renderToStaticMarkup(createElement(HomeHeader, {
      search: "walkthrough",
      onSearchChange: () => undefined
    }));

    expect(html).toContain("Projects");
    expect(html).toContain("Search projects, recordings, and edits");
    expect(html).toContain('value="walkthrough"');
  });

  it("renders quick-start workflows as dashboard cards", () => {
    const html = renderToStaticMarkup(createElement(HomeActionCard, {
      icon: createElement("span", null, "icon"),
      title: "Record",
      description: "Capture your screen.",
      actionLabel: "Start recording",
      disabled: false,
      onAction: () => undefined
    }));

    expect(html).toContain("data-home-action-card");
    expect(html).toContain("Start recording");
    expect(html).not.toContain("hover:shadow");
  });

  it("uses real project data in a larger project grid", () => {
    const gridHtml = renderToStaticMarkup(createElement(RecentProjectsSection, {
      projects: [project],
      loading: false,
      disabled: false,
      onRefresh: () => undefined,
      onOpen: () => undefined,
      onDelete: () => undefined
    }));

    expect(gridHtml).toContain("data-home-project-grid");
    expect(gridHtml).toContain("Product walkthrough");
    expect(gridHtml).toContain("min(100%,260px)");
  });

  it("keeps project artwork empty until the actual thumbnail loads", () => {
    const html = renderToStaticMarkup(createElement(ProjectArtwork, {
      name: project.name,
      index: 0,
      duration: "01:32",
      thumbnailUrl: "ovc-media://project/screen.webm"
    }));

    expect(html).toContain("data-project-artwork");
    expect(html).not.toContain("lucide-film");
    expect(html).not.toContain("bg-gradient-to-br");
  });
});
