// Client-safe: the GTM board columns (no server imports).
export const COLUMNS = [
  { key: "ready", label: "Ready to send", hint: "Drafted, waiting for your approval" },
  { key: "awaiting", label: "Awaiting reply", hint: "Sent; next follow-up not due yet" },
  { key: "followup_due", label: "Follow-up due", hint: "A follow-up is due or overdue" },
  { key: "in_talks", label: "In talks", hint: "Replied or meeting booked" },
  { key: "no_response", label: "No response", hint: "Sequence finished, no reply" },
  { key: "applied", label: "Applied", hint: "Converted" },
  { key: "closed", label: "Closed", hint: "Skipped, not pursued or unsubscribed" },
] as const
export type ColumnKey = (typeof COLUMNS)[number]["key"]

