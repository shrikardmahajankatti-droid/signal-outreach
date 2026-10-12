// Turns data/demo_startups.json into article rows for the real pipeline.
// Articles shared by several companies (e.g. a weekly roundup) become one multi-company article,
// so extraction and the source-merging logic are exercised exactly as with live news.
import demo from "@/data/demo_startups.json"

export type DemoItem = {
  company_name: string
  company_domain?: string | null
  round_stage: string
  round_label_in_press?: string
  amount_inr?: number
  amount_usd_reported?: number
  announced_date: string
  investors?: string[]
  founders?: { name: string; title: string }[]
  hq_city?: string | null
  hq_country?: string | null
  founded_year?: number
  sector?: string
  what_they_do?: string
  use_of_funds?: string
  personal_hook?: string
  sources: string[]
  expected: { decision: string; approx_fit?: number; flags?: string[]; reason_codes?: string[] }
}

export const DEMO_ITEMS = demo.articles as DemoItem[]

function money(item: DemoItem): string | null {
  const usd = item.amount_usd_reported
  const usdText = usd ? `$${(usd / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })} million` : null
  if (item.amount_inr) {
    const crore = item.amount_inr / 10_000_000
    return `Rs ${crore.toLocaleString("en-IN", { maximumFractionDigits: 1 })} crore${usdText ? ` (about ${usdText})` : ""}`
  }
  return usdText
}

function roundPhrase(item: DemoItem): string {
  const label = item.round_label_in_press ?? item.round_stage
  if (/undisclosed \(equity \+ debt\)/i.test(label)) return "in a mix of equity and debt"
  if (/^undisclosed$/i.test(label)) return "in new funding"
  return `in a ${label} round`
}

// A short press-style paragraph that states only the facts present in the demo record.
export function demoParagraph(item: DemoItem): string {
  const where = [item.hq_city, item.hq_country].filter((x) => x && x !== "Global").join(", ")
  const descriptor = `${where ? `${where}-based ` : ""}${item.sector ? `${item.sector} ` : ""}company`
  const lead = [
    item.company_name,
    item.company_domain ? ` (${item.company_domain})` : "",
    where || item.sector ? `, ${/^[AEIOU]/i.test(descriptor) ? "an" : "a"} ${descriptor}` : "",
    item.founded_year ? ` founded in ${item.founded_year}` : "",
    `, announced on ${item.announced_date} that it has raised ${money(item) ?? "an undisclosed amount"} ${roundPhrase(item)}`,
    item.investors?.length ? `, with participation from ${item.investors.join(", ")}` : "",
    ".",
  ].join("")
  const parts = [lead]
  if (item.founders?.length) parts.push(`The company was founded by ${item.founders.map((f) => `${f.name} (${f.title})`).join(", ")}.`)
  if (item.what_they_do) parts.push(item.what_they_do)
  if (item.use_of_funds) parts.push(`The company plans to use the capital for: ${item.use_of_funds}.`)
  if (item.personal_hook) parts.push(item.personal_hook)
  return parts.join(" ")
}

export type DemoArticle = { url: string; title: string; source: string; publishedAt: Date; rawText: string; companies: string[] }

export function buildDemoArticles(items: DemoItem[] = DEMO_ITEMS): DemoArticle[] {
  const byUrl = new Map<string, DemoItem[]>()
  for (const item of items) for (const url of item.sources) byUrl.set(url, [...(byUrl.get(url) ?? []), item])
  return [...byUrl.entries()].map(([url, group]) => {
    const host = new URL(url).hostname.replace(/^www\./, "")
    const latest = group.map((g) => g.announced_date).sort().at(-1)!
    const title =
      group.length === 1
        ? `${group[0].company_name} raises ${money(group[0]) ?? "funding"} ${roundPhrase(group[0])}`
        : `Funding roundup: ${group.map((g) => g.company_name).slice(0, 3).join(", ")} and ${group.length - 3 > 0 ? `${group.length - 3} more` : "others"} raised this week`
    return {
      url,
      title,
      source: `${host} (demo)`,
      publishedAt: new Date(`${latest}T09:00:00Z`),
      rawText: group.map(demoParagraph).join("\n\n"),
      companies: group.map((g) => g.company_name),
    }
  })
}

// The demo runs on a fixed clock (the day after the latest demo announcement) so its
// G3 recency decisions stay the same no matter when the demo is replayed.
export function demoReferenceDate(items: DemoItem[] = DEMO_ITEMS): string {
  const latest = items.map((i) => i.announced_date).sort().at(-1)!
  const d = new Date(`${latest}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}
