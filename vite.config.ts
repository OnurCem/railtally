/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Rotaray",
        short_name: "Rotaray",
        description: "Unofficial train board game companion",
        display: "standalone",
        background_color: "#10202b",
        theme_color: "#10202b",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
