/**
 * Stops a leftover guengo-api from a previous dev session so port 8080 is free.
 */
import { execSync } from "node:child_process";
import process from "node:process";

function killStaleApi() {
  try {
    if (process.platform === "win32") {
      execSync("taskkill /F /IM guengo-api.exe", {
        stdio: "ignore",
        windowsHide: true,
      });
      console.log("[Guengo] Stopped leftover guengo-api.exe on port 8080.");
      return;
    }

    execSync("pkill -f guengo-api || true", {
      stdio: "ignore",
      shell: true,
    });
    console.log("[Guengo] Stopped leftover guengo-api process.");
  } catch {
    // No stale process — normal on first start.
  }
}

killStaleApi();
