import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // The renderer is a single vendored package; its two largest internal areas
    // are split below, but the remaining core still exceeds Vite's 500 kB
    // advisory on its own. 700 kB keeps the warning meaningful for app code
    // without flagging that one unavoidable vendor chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // The renderer, UI framework and markdown stack are independent of the
        // app code, so splitting them keeps the entry chunk small without
        // changing what loads on first paint.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("pixi.js") || id.includes("@pixi/")) return "vendor-pixi";
          if (/[\\/]node_modules[\\/](zustand|immer|nanoid|clsx|tailwind-merge)[\\/]/.test(id)) {
            return "vendor-state";
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/(react-markdown|remark-|micromark|mdast|hast|unified|unist|vfile|property-information|devlop|bail|trough|character-entities|decode-named-character-reference|html-url-attributes|longest-streak|markdown-table|zwitch|ccount|escape-string-regexp)/.test(id)) {
            return "vendor-markdown";
          }
          if (id.includes("@radix-ui") || id.includes("/lucide-react/")) return "vendor-ui";
          if (/[\\/]node_modules[\\/]zod[\\/]/.test(id)) return "vendor-zod";
        },
      },
    },
  },
});
