import { getSetting } from "@/lib/config"

// DEMO_MODE env var is the default; the Settings toggle stores an override in app_settings.
export function isDemoModeEnv(): boolean {
  return (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false"
}

export async function getDemoMode(): Promise<boolean> {
  try {
    const override = await getSetting<boolean>("demo_mode_override")
    return typeof override === "boolean" ? override : isDemoModeEnv()
  } catch {
    return isDemoModeEnv()
  }
}

export async function getTestInbox(): Promise<string | null> {
  try {
    const override = await getSetting<string>("test_inbox_override")
    return override || process.env.TEST_INBOX || null
  } catch {
    return process.env.TEST_INBOX || null
  }
}

// Kept for synchronous callers (e.g. static labels); prefer getDemoMode().
export const isDemoMode = isDemoModeEnv
