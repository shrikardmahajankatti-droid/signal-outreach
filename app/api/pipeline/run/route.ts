import { NextResponse } from "next/server"

// Calls each stage in order. Stages are wired up from Phase 3 onward.
export async function POST() {
  return NextResponse.json({ ok: true, stages: [], message: "No stages wired yet (Phase 1)" })
}
