// Imported first by every script so .env.local is loaded before anything reads process.env.
import { config } from "dotenv"
config({ path: ".env.local" })
