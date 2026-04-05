import { notifyOpenClaw } from "@/lib/openclaw";
import { NextResponse } from "next/server";

export async function GET() {
  await notifyOpenClaw(
    "Fall detected in Living Room by Camera 1. Patient: Taha. Time: just now. Please notify the on-duty caregiver."
  );
  return NextResponse.json({ ok: true, note: "Check OpenClaw logs or console for delivery" });
}
