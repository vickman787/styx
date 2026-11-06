import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  resolve: { alias: [{ find: /^buffer$/, replacement: "buffer/" }] },
  define: { global: "globalThis", "process.env": "{}" },
  plugins: [
    react(),
    {
      name: "styx-wallet-local-fonts",
      enforce: "pre",
      transform(code, id) {
        // The chooser uses the app's font fallback without requiring a remote
        // stylesheet before Vite can resolve its lazy CSS preload.
        if (
          id.includes("@near-wallet-selector/modal-ui/") &&
          id.endsWith(".css")
        )
          return code.replace(
          /^@import[^\r\n]*fonts\.googleapis\.com[^\r\n]*[\r\n]+/gm,
            "",
          );
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    watch: {
      ignored: ["**/playwright-report/**", "**/test-results/**", "**/data/**"],
    },
  },
  build: { outDir: "dist" },
});
