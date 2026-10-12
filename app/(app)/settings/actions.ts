"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { resetDemo } from "@/lib/pipeline/demo-reset"
import { insertDemoArticles } from "@/lib/pipeline/demo-seed"
import { runStage } from "@/lib/pipeline/stages"
import type { AcceleratorProfile } from "@/lib/prompts/draft"

type Result = { ok: true; message?: string } | { ok: false; error: string }

async function run(fn: () => Promise<string | void>): Promise<Result> {
  try {
    const message = await fn()
    revalidatePath("/", "layout")
    return { ok: true, message: message ?? "Saved" }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function setSetting(key: string, value: unknown) {
  await getDb().insert(schema.appSettings).values({ key, value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } })
}

export async function setDemoModeAction(on: boolean) {
  return run(async () => {
    const { liveSendAllowed } = await import("@/lib/env")
    if (!on && !liveSendAllowed()) throw new Error("Live sending is locked: set ALLOW_LIVE_SEND=true in Vercel to allow turning demo mode off")
    await setSetting("demo_mode_override", on)
    return on ? "DEMO MODE on: every email goes to the test inbox" : "DEMO MODE off: approved emails go to real founders"
  })
}

export async function setTestInboxAction(email: string) {
  return run(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) throw new Error("Enter a valid email")
    await setSetting("test_inbox_override", email.trim())
  })
}

export async function saveAcceleratorAction(profile: AcceleratorProfile) {
  return run(async () => {
    if (!profile.name.trim()) throw new Error("Name is required")
    await setSetting("accelerator_profile", { ...profile, offers: profile.offers.filter((o) => o.trim()) })
    return "Saved. New and regenerated drafts use it."
  })
}

export async function addSourceAction(name: string, type: string, url: string) {
  return run(async () => {
    if (!name.trim() || !url.trim()) throw new Error("Name and URL/query are required")
    if (!["rss", "gnews", "newsdata"].includes(type)) throw new Error("Unknown type")
    if (type === "rss" && !/^https?:\/\//.test(url)) throw new Error("RSS sources need a URL")
    await getDb().insert(schema.sources).values({ name: name.trim(), type, url: url.trim() }).onConflictDoUpdate({ target: schema.sources.url, set: { active: true, name: name.trim() } })
  })
}

export async function toggleSourceAction(id: number, active: boolean) {
  return run(async () => {
    await getDb().update(schema.sources).set({ active }).where(eq(schema.sources.id, id))
  })
}

export async function addInvestorAction(name: string, portfolioUrl: string) {
  return run(async () => {
    if (!name.trim() || !/^https?:\/\//.test(portfolioUrl)) throw new Error("Name and a portfolio URL are required")
    await getDb().insert(schema.investors).values({ name: name.trim(), portfolioUrl: portfolioUrl.trim() }).onConflictDoUpdate({ target: schema.investors.name, set: { portfolioUrl: portfolioUrl.trim(), active: true } })
  })
}

export async function toggleInvestorAction(id: number, active: boolean) {
  return run(async () => {
    await getDb().update(schema.investors).set({ active }).where(eq(schema.investors.id, id))
  })
}

export async function resetDemoAction() {
  return run(async () => {
    const r = await resetDemo()
    const seeded = await insertDemoArticles()
    return `Removed ${r.startups} demo-only startups and ${r.articles} demo articles; re-loaded ${seeded.inserted} demo articles. Click "Run pipeline now" to process them.`
  })
}

export async function runStageAction(stage: "summary" | "followups") {
  return run(async () => {
    const r = await runStage(stage, "manual")
    if (r.status === "error") throw new Error(r.errors[0]?.message ?? "failed")
    return `${stage}: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ")}`
  })
}
