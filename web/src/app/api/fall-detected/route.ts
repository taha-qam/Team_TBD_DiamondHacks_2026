// POST — receives metadata from fall model, creates alert, triggers OpenClaw webhook
// Implementation per ARCHITECTURE.md Step 2

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "not yet implemented" }, { status: 501 });
}
