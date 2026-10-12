import { describe, expect, it } from "vitest"
import { renderFooter, validateEmail, withFooter } from "@/lib/validateEmail"
import { computeFitScore } from "@/lib/pipeline/score-draft"
import { findEmployeeBand, matchFounderLinkedIn, pickCompanyDomain } from "@/lib/research/match"

const RULES = {
  subjectMaxChars: 50,
  bodyMaxWords: 150,
  bannedPhrases: ["hope this finds you well", "just checking in"],
  spamWords: ["free", "guarantee", "100%", "urgent"],
  footer: "—\nRohit\n{{accelerator_name}}\n\nNot the right time? Reply \"unsubscribe\" or use {{unsubscribe_url}} and I won't email again.",
}
const FOOTER = renderFooter(RULES.footer, { accelerator_name: "Launchpad", unsubscribe_url: "https://x.test/unsubscribe/1.abc" })
const CTX = { companyName: "Desible.ai", openerFacts: ["Uttam", "Prime Venture Partners", "voice AI is the entry point, not the final destination"] }

const GOOD = {
  subject: "Desible.ai and Launchpad",
  body: withFooter(
    `Hi Uttam,

You described voice AI as the entry point for Desible, not the final destination.
Moving from voice into WhatsApp and email for banks usually makes enterprise sales the next bottleneck.
Launchpad runs hands-on GTM support with mentors who have sold into BFSI.
Would a 20-minute call next week be useful?`,
    FOOTER
  ),
}

const failed = (email: { subject: string; body: string }) =>
  validateEmail(email, RULES, CTX).checks.filter((c) => !c.pass).map((c) => c.key)

describe("validateEmail", () => {
  it("passes a compliant email", () => {
    const r = validateEmail(GOOD, RULES, CTX)
    expect(r.checks.filter((c) => !c.pass)).toEqual([])
    expect(r.pass).toBe(true)
  })
  it("doesn't count the footer towards the word limit", () => {
    expect(validateEmail(GOOD, RULES, CTX).wordCount).toBeLessThan(60)
  })
  it("rejects a long subject and one without the company", () => {
    expect(failed({ ...GOOD, subject: "A very long subject line that goes well past fifty characters" })).toEqual(
      expect.arrayContaining(["subject_length", "subject_names_company"])
    )
  })
  it("requires exactly one question", () => {
    expect(failed({ ...GOOD, body: GOOD.body.replace("useful?", "useful.") })).toContain("one_ask")
    expect(failed({ ...GOOD, body: GOOD.body.replace("bottleneck.", "bottleneck?") })).toContain("one_ask")
  })
  it("catches exclamation marks, banned phrases and spam words (word boundaries)", () => {
    const body = GOOD.body.replace("Hi Uttam,", "Hi Uttam, hope this finds you well!").replace("useful?", "useful, free of cost?")
    expect(failed({ ...GOOD, body })).toEqual(expect.arrayContaining(["no_exclamation", "no_banned_phrases", "no_spam_words"]))
    expect(failed({ ...GOOD, body: GOOD.body.replace("useful?", "useful, freely?") })).not.toContain("no_spam_words")
  })
  it("requires the unsubscribe footer", () => {
    expect(failed({ ...GOOD, body: GOOD.body.split("\n—\n")[0] })).toContain("footer")
  })
  it("requires a specific first line", () => {
    expect(failed({ ...GOOD, body: GOOD.body.replace(/You described[^\n]+/, "Congratulations on the exciting news.") })).toContain("opener_specific")
  })
  it("rejects markdown and placeholders", () => {
    expect(failed({ ...GOOD, body: GOOD.body.replace("Launchpad runs", "**Launchpad** runs {{first_name}}") })).toEqual(
      expect.arrayContaining(["plain_text", "no_placeholders"])
    )
  })
  it("rejects bodies at or over the word limit", () => {
    const long = GOOD.body.replace("Would", `${"word ".repeat(150)}Would`)
    expect(failed({ ...GOOD, body: long })).toContain("body_length")
  })
})

describe("computeFitScore", () => {
  const cfg = { penalty_large_team: 15, penalty_older_company: 10, penalty_multiple_seed: 5, bonus_serial_founder: 5 }
  const weights = { sector: 35, geography: 20, business_model: 15, team: 15, timing: 15 }
  const factors = { sector: 100, geography: 100, business_model: 60, team: 40, timing: 80 }

  it("weights factor scores by the live thesis weights", () => {
    expect(computeFitScore(factors, weights, [], cfg).score).toBe(Math.round((35 * 100 + 20 * 100 + 15 * 60 + 15 * 40 + 15 * 80) / 100))
  })
  it("changing a weight changes the score", () => {
    const a = computeFitScore(factors, weights, [], cfg).score
    const b = computeFitScore(factors, { ...weights, sector: 5, team: 45 }, [], cfg).score
    expect(b).toBeLessThan(a)
  })
  it("applies the soft-signal adjustments from qualification.md §4b", () => {
    const base = computeFitScore(factors, weights, [], cfg).score
    const r = computeFitScore(factors, weights, ["large_team", "older_company", "serial_founder"], cfg)
    expect(r.score).toBe(base - 15 - 10 + 5)
    expect(r.adjustments).toHaveLength(3)
  })
})

describe("research matching", () => {
  const r = (title: string, url: string, content = "") => ({ title, url, content, score: 1 })

  it("needs the founder's name in the LinkedIn profile", () => {
    const results = [
      r("Pranjali W. - Desible.ai | LinkedIn", "https://in.linkedin.com/in/pranjaliwaykos", "Founder's office at Desible.ai"),
      r("Omkar Raikar - Founder - Desible.ai | LinkedIn", "https://in.linkedin.com/in/omkar-raikar", "Founder at Desible.ai"),
    ]
    const m = matchFounderLinkedIn({ name: "Omkar Raikar", title: "Founder" }, "Desible.ai", results)
    expect(m?.url).toBe("https://in.linkedin.com/in/omkar-raikar")
    expect(m?.confidence).toBe(1)
    expect(matchFounderLinkedIn({ name: "Someone Else", title: null }, "Desible.ai", results)).toBeNull()
  })
  it("picks the company's own site over news and social results", () => {
    const results = [
      r("Zomint raises Rs 36 Cr", "https://inc42.com/buzz/zomint"),
      r("Zomint | LinkedIn", "https://www.linkedin.com/company/zomint"),
      r("Zomint - Wealth management", "https://www.zomint.com/"),
    ]
    expect(pickCompanyDomain("Zomint", results)?.domain).toBe("zomint.com")
  })
  it("reads LinkedIn size bands from snippets", () => {
    expect(findEmployeeBand([r("Acme | LinkedIn", "https://linkedin.com/company/acme", "Software · 11-50 employees · Bengaluru")])).toMatchObject({ min: 11, max: 50 })
  })
})
