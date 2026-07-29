import { describe, expect, it } from "vitest";

const describeOnMac = process.platform === "darwin" ? describe : describe.skip;

describeOnMac("Mac App Store provisioning profile preparation", () => {
  it("reads the application identifier and expiration date", async () => {
    const { readProfileMetadata } = await import(
      "../scripts/prepare-mas-profile.mjs"
    );
    const metadata = readProfileMetadata(`
      <plist>
        <dict>
          <key>ExpirationDate</key>
          <date>2027-07-22T07:45:30Z</date>
          <key>Entitlements</key>
          <dict>
            <key>com.apple.application-identifier</key>
            <string>3XX79RB95N.com.openvideocraft.app</string>
          </dict>
        </dict>
      </plist>
    `);

    expect(metadata.applicationIdentifier).toBe(
      "3XX79RB95N.com.openvideocraft.app"
    );
    expect(metadata.expirationDate?.toISOString()).toBe(
      "2027-07-22T07:45:30.000Z"
    );
  });

  it("returns null for malformed profile values", async () => {
    const { readProfileMetadata } = await import(
      "../scripts/prepare-mas-profile.mjs"
    );
    expect(readProfileMetadata("<plist><dict /></plist>")).toEqual({
      applicationIdentifier: null,
      expirationDate: null
    });
  });
});
