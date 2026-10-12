import "./load-env"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"

async function main() {
  const db = drizzle({ client: neon(process.env.DATABASE_URL!) })
  await migrate(db, { migrationsFolder: "drizzle" })
  console.log("Migrations applied")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
