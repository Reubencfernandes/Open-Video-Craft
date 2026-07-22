import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { ChangelogDialog } from "../src/renderer/home/ChangelogDialog";
import { latestRelease } from "../src/renderer/home/latest-release";

describe("ChangelogDialog", () => {
  it("presents the release as a branded update card", () => {
    const html = renderToStaticMarkup(createElement(ChangelogDialog, {
      open: true,
      onClose: () => undefined
    }));

    expect(html).toContain("data-changelog-card");
    expect(html).toContain(`Open Video Craft ${latestRelease.version}`);
    expect(html).not.toContain(latestRelease.title);
    expect(html).toContain(`Released ${latestRelease.releasedAt}`);
    expect(html).toContain(latestRelease.summary);
    expect(html).toContain("About this update");
    expect(html).toContain("What changed");
    expect(html).toContain("data-changelog-hero");
    expect(html).toContain('data-has-image="true"');
    expect(html).toContain("release-1.0.0-hero.jpg");
    expect(html).toContain("data-changelog-content");
    expect(html).not.toContain('<article class="mt-5 rounded-2xl bg-[#18181b]');
    expect(html).not.toContain("Highlights");
    expect(html).not.toMatch(/linear-gradient|Sparkles/);
    expect(html).toContain("Got it");
  });

  it("keeps release metadata current without advertising inline time inputs", () => {
    const releaseText = [latestRelease.title, latestRelease.summary, ...latestRelease.changes]
      .join(" ");

    expect(latestRelease.version).toBe(packageJson.version);
    expect(latestRelease.version).toBe("1.0.2");
    expect(releaseText).toMatch(/timeline/i);
    expect(releaseText).not.toMatch(/start and end timecodes|timecode inputs?|editable timestamps?/i);
  });

  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(createElement(ChangelogDialog, {
      open: false,
      onClose: () => undefined
    }));

    expect(html).toBe("");
  });
});
