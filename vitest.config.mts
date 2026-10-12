import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
})
