import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import * as schema from "./schema"

export type DB = NeonHttpDatabase<typeof schema>

let _db: DB | null = null

// Lazily created so pages can render a helpful error when DATABASE_URL is missing.
export function getDb(): DB {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  _db = drizzle({ client: neon(url), schema })
  return _db
}

export { schema }
