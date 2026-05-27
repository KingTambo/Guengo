/**
 * Runs before `npm run dev`.
 * Gives a clearer message than `'cargo' is not recognized`.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync("cargo", ["--version"], {
  encoding: "utf8",
  shell: true,
  windowsHide: true,
});

const ok =
  result.status === 0 &&
  typeof result.stdout === "string" &&
  /^cargo\b/m.test(result.stdout);

if (!ok) {
  const win =
    process.platform === "win32"
      ? `  1. Install Rust: https://rustup.rs/\n  2. Close this terminal and open a new one (PATH must include ~/.cargo/bin).\n  3. Run: npm run dev\n\n  Frontend-only (no Axum yet): npm run dev:spa\n`
      : `  Install Rust: https://rustup.rs/\n  Then reopen your terminal and run: npm run dev\n\n  Frontend-only: npm run dev:spa\n`;

  console.error(`
[Guengo] 'cargo' is not available on your PATH (${process.platform}).

Backend (Axum) needs the Rust toolchain. Next steps:

${win}`);
  process.exit(1);
}
