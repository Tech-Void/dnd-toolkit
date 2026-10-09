import { defineConfig } from "vite";

// Builds dist/ as a complete Foundry module folder: static/ (module.json, styles)
// is copied as-is and the TS is bundled (including @dnd-toolkit/core) into one ES module.
export default defineConfig({
  publicDir: "static",
  build: {
    outDir: process.env.FOUNDRY_MODULE_DIR ?? "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "scripts/main.js",
    },
    // One file: the windows are imported lazily in the source (so tests don't need Foundry), not split.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
