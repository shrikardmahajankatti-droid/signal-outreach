// Parses qualification.md (the source of truth for accept/reject rules) into
// the rows that scripts/setup.ts loads into Neon. Pure: no I/O.

export type ParsedConfigRow = { key: string; value: unknown; description: string }

export type ParsedThesis = {
  sectors: string[]
  geographies: string[]
  businessModels: string[]
  teamSignals: string[]
  timingSignals: string[]
  excludedSectors: string[]
  weights: { sector: number; geography: number; business_model: number; team: number; timing: number }
}

export type ParsedQualification = { config: ParsedConfigRow[]; thesis: ParsedThesis }

function section(md: string, n: number): string {
  const start = md.search(new RegExp(`^## ${n}\\.`, "m"))
  if (start === -1) throw new Error(`qualification.md: section ${n} not found`)
  const rest = md.slice(start + 3)
  const end = rest.search(/^## \d+\./m)
  return end === -1 ? rest : rest.slice(0, end)
}

function tableRows(block: string): string[][] {
  return block
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && !/^\|\s*-/.test(l.trim()))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
    )
}

function parseValue(raw: string): unknown {
  const v = raw.replace(/`/g, "").trim()
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

function splitList(raw: string, separators = /,\s*/): string[] {
  return raw
    .replace(/\*\*/g, "")
    .split(separators)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean)
}

export function parseQualificationMd(md: string): ParsedQualification {
  // Section 7: config table.
  const config: ParsedConfigRow[] = []
  for (const [key, def, meaning] of tableRows(section(md, 7))) {
    const m = key.match(/^`([a-z0-9_]+)`$/)
    if (!m) continue
    config.push({ key: m[1], value: parseValue(def), description: meaning === "—" ? "" : meaning })
  }
  const fx = md.match(/`inr_per_usd\s*=\s*(\d+(?:\.\d+)?)`/)
  if (fx) config.push({ key: "inr_per_usd", value: Number(fx[1]), description: "Fixed INR→USD rate" })

  // Section 6: thesis table + excluded sectors.
  const s6 = section(md, 6)
  const byFactor = new Map<string, { weight: number; text: string }>()
  for (const [factor, weight, text] of tableRows(s6)) {
    if (!/^\d+$/.test(weight)) continue
    byFactor.set(factor.toLowerCase(), { weight: Number(weight), text })
  }
  const get = (prefix: string) => {
    const hit = [...byFactor.entries()].find(([k]) => k.startsWith(prefix))
    if (!hit) throw new Error(`qualification.md: thesis factor "${prefix}" not found`)
    return hit[1]
  }
  const sector = get("sector")
  const geography = get("geography")
  const model = get("business")
  const team = get("team")
  const timing = get("timing")

  const excludedLine = s6.split("\n").find((l) => l.includes("Excluded sectors"))
  if (!excludedLine) throw new Error("qualification.md: excluded sectors line not found")
  const excludedSectors = splitList(excludedLine.split(":**")[1] ?? "")

  return {
    config,
    thesis: {
      sectors: splitList(sector.text),
      geographies: splitList(geography.text),
      businessModels: splitList(model.text, /[,;]\s*/),
      teamSignals: splitList(team.text),
      timingSignals: [timing.text],
      excludedSectors,
      weights: {
        sector: sector.weight,
        geography: geography.weight,
        business_model: model.weight,
        team: team.weight,
        timing: timing.weight,
      },
    },
  }
}
