import { notifyOpenClaw } from "@/lib/openclaw";
import { NextResponse } from "next/server";

export async function GET() {
  await notifyOpenClaw(
    "TEST ALERT — This is a test message from FallGuard. " +
      "Please fetch and analyze this image: http://localhost:3000/fall-images/test.jpg " +
      "Describe what you see and send an alert to: family, nurse-on-duty."
  );
  return NextResponse.json({ ok: true, note: "Check OpenClaw logs or console for delivery" });
}
