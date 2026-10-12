export const OPENER_LABELS: Record<string, string> = {
  founder_post: "Founder post",
  founder_quote: "Founder quote",
  product_detail: "Product detail",
  shared_investor: "Shared investor",
}

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (now - new Date(iso).getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export const FLAG_LABELS: Record<string, string> = {
  size_unverified: "size unverified",
  late_catch: "late catch",
  domain_to_enrich: "no domain",
  multi_source_merged: "multiple sources",
  check_stage: "check stage",
  large_team: "large team",
  older_company: "older company",
  multiple_seed: "multiple seeds",
  large_round_check: "large round",
}
