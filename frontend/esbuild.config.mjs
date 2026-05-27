import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

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
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
