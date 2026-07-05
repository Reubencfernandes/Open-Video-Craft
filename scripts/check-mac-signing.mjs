import { execFileSync } from "node:child_process";

function hasNotarizationCredentials() {
  const hasAppleIdCredentials =
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID;
  const hasApiKeyCredentials =
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER;
  const hasKeychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;

  return Boolean(hasAppleIdCredentials || hasApiKeyCredentials || hasKeychainProfile);
}

if (process.platform !== "darwin") {
  console.error("Mac signing must run on macOS.");
  process.exit(1);
}

const hasCertificateFromEnv = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
let identities = "";

if (!hasCertificateFromEnv) {
  identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8"
  });
}

if (!hasCertificateFromEnv && !identities.includes("Developer ID Application:")) {
  console.error("Missing Developer ID Application signing certificate.");
  console.error("Install a Developer ID Application certificate in Keychain Access, or set CSC_LINK/CSC_NAME for CI.");
  console.error("Current codesigning identities:");
  console.error(identities.trim() || "No valid identities found.");
  process.exit(1);
}

if (!hasNotarizationCredentials()) {
  console.error("Missing notarization credentials.");
  console.error("Set one of these before building:");
  console.error("- APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID");
  console.error("- APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER");
  console.error("- APPLE_KEYCHAIN_PROFILE, optionally APPLE_KEYCHAIN");
  process.exit(1);
}

console.log("Mac signing preflight passed.");
