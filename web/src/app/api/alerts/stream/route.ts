// SSE endpoint for real-time alert push — implementation per specs/web-sse.md

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "not yet implemented" }, { status: 501 });
}
