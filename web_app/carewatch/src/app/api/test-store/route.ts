import {
  createAlert,
  listAlerts,
  getAlert,
  updateAlertStatus,
  addTimelineEntry,
  checkRateLimit,
  recordAlert,
} from "@/lib/alerts";
import { NextResponse } from "next/server";

export async function GET() {
  // 1. Create an alert
  const alert = createAlert({
    cameraId: "cam-01",
    cameraLabel: "Living Room Camera",
    patientName: "Taha",
    imagePath: "/fall-images/fall-123.jpg",
    location: "Living Room",
  });

  // 2. Verify it exists
  const fetched = getAlert(alert.id);

  // 3. List all
  const all = listAlerts();

  // 4. Update status
  const acked = updateAlertStatus(alert.id, "acknowledged");

  // 5. Add timeline entry
  const updated = addTimelineEntry(alert.id, "openclaw_notified", "Webhook sent");

  // 6. Illegal transition — should throw
  let error = null;
  try {
    updateAlertStatus(alert.id, "detected");
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 7. Rate limiter
  const firstCheck = checkRateLimit("cam-01", 10);
  recordAlert("cam-01");
  const secondCheck = checkRateLimit("cam-01", 10);

  return NextResponse.json({
    created: alert,
    fetched: fetched?.id === alert.id,
    listCount: all.length,
    ackedStatus: acked.status,
    timelineCount: updated.timeline.length,
    illegalTransitionError: error,
    rateLimiter: { firstCheck, secondCheck },
  });
}
