// Checks every cold-email rule in code (email_rules row + the ZoomInfo rules in the spec).
// Used after drafting (to trigger Gemini rewrites), in the editor's pre-send checklist,
// and again server-side before anything is sent. Pure: no I/O.

export type EmailRulesInput = {
  subjectMaxChars: number
  bodyMaxWords: number
  bannedPhrases: string[]
  spamWords: string[]
  footer: string
}

export type EmailContext = {
  companyName: string
  // Specific facts the first line may cite: founder names, investors, product words, numbers.
  openerFacts?: string[]
}

export type EmailCheck = { key: string; label: string; pass: boolean; detail?: string }
export type EmailValidation = { pass: boolean; checks: EmailCheck[]; wordCount: number }

export const FOOTER_MARKER = "unsubscribe"

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// Word-boundary match that also works for phrases and symbols like "100%".
function containsTerm(text: string, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return false
  const re = new RegExp(`(^|[^a-z0-9])${escape(t)}($|[^a-z0-9])`, "i")
  return re.test(text.toLowerCase())
}

// Body as written, without the standard footer (the footer is fixed boilerplate and
// doesn't count towards the word limit).
export function stripFooter(body: string, footer: string): string {
  const firstFooterLine = footer.split("\n").find((l) => l.trim() && l.trim() !== "—")?.trim()
  const idx = body.lastIndexOf("\n—\n")
  if (idx !== -1) return body.slice(0, idx).trim()
  if (firstFooterLine) {
    const j = body.lastIndexOf(firstFooterLine)
    if (j !== -1) return body.slice(0, j).trim()
  }
  return body.trim()
}

const STOP = new Set(["that", "this", "with", "your", "you", "from", "have", "their", "they", "about", "into", "just", "what", "when", "will", "were", "been", "also", "more", "than"])
const significant = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  )
// How many meaningful words the opener shares with a known fact (paraphrased facts count).
function sharedWords(a: string, b: string): number {
  const x = significant(a)
  let n = 0
  for (const w of significant(b)) if (x.has(w)) n++
  return n
}

function companyVariants(name: string): string[] {
  const base = name.trim()
  const noTld = base.replace(/\.(ai|io|com|in|co|app)$/i, "")
  const spaced = noTld.replace(/([a-z])([A-Z])/g, "$1 $2")
  return [...new Set([base, noTld, spaced, noTld.replace(/ai$/i, "").trim()])].filter((v) => v.length >= 2)
}

export function validateEmail(
  email: { subject: string; body: string },
  rules: EmailRulesInput,
  ctx: EmailContext
): EmailValidation {
  const subject = email.subject.trim()
  const fullBody = email.body.replace(/\r\n/g, "\n")
  const body = stripFooter(fullBody, rules.footer)
  const words = countWords(body)
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean)
  // Skip a greeting line ("Hi Omkar,") when finding the opener.
  const firstLine = (lines[0] && /^(hi|hello|hey|dear)\b[^.?!]{0,40},?$/i.test(lines[0]) ? lines[1] : lines[0]) ?? ""
  const questions = (body.match(/\?/g) ?? []).length
  const banned = rules.bannedPhrases.filter((p) => containsTerm(`${subject}\n${body}`, p))
  const spam = rules.spamWords.filter((w) => containsTerm(`${subject}\n${body}`, w))
  const variants = companyVariants(ctx.companyName)
  const openerFacts = (ctx.openerFacts ?? []).filter((f) => f && f.length >= 3)

  const checks: EmailCheck[] = [
    {
      key: "subject_length",
      label: `Subject < ${rules.subjectMaxChars} characters`,
      pass: subject.length > 0 && subject.length < rules.subjectMaxChars,
      detail: `${subject.length} characters`,
    },
    {
      key: "subject_names_company",
      label: "Subject names the company",
      pass: variants.some((v) => subject.toLowerCase().includes(v.toLowerCase())),
    },
    {
      key: "body_length",
      label: `Body < ${rules.bodyMaxWords} words`,
      pass: words > 0 && words < rules.bodyMaxWords,
      detail: `${words} words`,
    },
    {
      key: "opener_specific",
      label: "First line uses a specific fact",
      pass:
        firstLine.length > 0 &&
        (openerFacts.some((f) => firstLine.toLowerCase().includes(f.toLowerCase()) || sharedWords(firstLine, f) >= 3) ||
          variants.some((v) => firstLine.toLowerCase().includes(v.toLowerCase())) ||
          /\d/.test(firstLine) ||
          /["“].+["”]/.test(firstLine)),
      detail: firstLine.slice(0, 80),
    },
    {
      key: "one_ask",
      label: "Exactly one ask",
      pass: questions === 1,
      detail: `${questions} question${questions === 1 ? "" : "s"}`,
    },
    { key: "no_exclamation", label: "No exclamation marks", pass: !/!/.test(`${subject}${body}`) },
    {
      key: "no_banned_phrases",
      label: "No banned phrases",
      pass: banned.length === 0,
      detail: banned.length ? banned.join(", ") : undefined,
    },
    {
      key: "no_spam_words",
      label: "No spam words",
      pass: spam.length === 0,
      detail: spam.length ? spam.join(", ") : undefined,
    },
    {
      key: "plain_text",
      label: "Plain text",
      pass: !/<[a-z][^>]*>|\*\*|__|^#+\s|\[[^\]]+\]\([^)]+\)/im.test(body),
    },
    { key: "no_placeholders", label: "No placeholders", pass: !/\{\{|\}\}|\[(name|company|founder)[^\]]*\]/i.test(fullBody) },
    {
      key: "footer",
      label: "Unsubscribe footer",
      pass: fullBody.toLowerCase().includes(FOOTER_MARKER),
    },
  ]
  return { pass: checks.every((c) => c.pass), checks, wordCount: words }
}

export function renderFooter(footer: string, vars: { accelerator_name: string; unsubscribe_url: string }): string {
  return footer.replace(/\{\{accelerator_name\}\}/g, vars.accelerator_name).replace(/\{\{unsubscribe_url\}\}/g, vars.unsubscribe_url)
}

export function withFooter(body: string, renderedFooter: string): string {
  return `${body.trim()}\n\n${renderedFooter.trim()}`
}
