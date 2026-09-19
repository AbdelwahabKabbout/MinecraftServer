import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ loose: true })],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});