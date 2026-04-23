import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.tsx", "components/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["lib/**", "node"],
      ["app/**", "jsdom"],
      ["components/**", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
