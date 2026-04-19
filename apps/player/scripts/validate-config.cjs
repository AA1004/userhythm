const DEFAULT_TARGET_URL = "https://userhythm.kr";
const targetUrl = process.env.PLAYER_TARGET_URL || DEFAULT_TARGET_URL;

function fail(message) {
  console.error(`[player:build] ${message}`);
  process.exit(1);
}

try {
  // Validate URL early so CI fails with a clear message.
  const parsed = new URL(targetUrl);
  if (!parsed.protocol.startsWith("http")) {
    fail(`Unsupported PLAYER_TARGET_URL protocol: ${parsed.protocol}`);
  }
  console.log(`[player:build] target URL: ${parsed.toString()}`);
  console.log("[player:build] config validation passed");
} catch (error) {
  fail(`Invalid PLAYER_TARGET_URL: ${targetUrl} (${String(error)})`);
}

