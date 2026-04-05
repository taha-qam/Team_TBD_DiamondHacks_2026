// PATCH (acknowledge / resolve alert) — implementation per specs/web-api.md

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "not yet implemented" }, { status: 501 });
}
