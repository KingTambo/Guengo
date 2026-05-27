import * as esbuild from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(here, "../.env");

/** Load repo-root `.env` for local builds (never overrides existing env). */
function loadRootEnvFile() {
  if (!existsSync(rootEnv)) return;
  for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnvFile();

/** Public keys baked at build time (Vercel/Railway build env or local `.env`). */
const buildPublicConfig = {
  supabase_url: process.env.SUPABASE_URL?.trim() || "",
  supabase_anon_key: process.env.SUPABASE_ANON_KEY?.trim() || "",
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || "",
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/index.tsx"],
  bundle: true,
  outfile: "public/dist/app.js",
  format: "esm",
  sourcemap: true,
  jsx: "automatic",
  target: ["es2022"],
  logLevel: "info",
  minify: !watch,
  define: {
    __GUENGO_BUILD_PUBLIC_CONFIG__: JSON.stringify(buildPublicConfig),
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
