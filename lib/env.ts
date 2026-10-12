// Server-only helpers for reading configuration. Secrets never leave the server.
export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false"
}
