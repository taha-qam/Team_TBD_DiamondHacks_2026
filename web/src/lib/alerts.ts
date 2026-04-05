import { Alert, AlertStatus, TimelineEntry } from "@/types";
import { randomUUID } from "crypto";

// --- In-memory stores ---

const alerts = new Map<string, Alert>();
const rateLimitMap = new Map<string, number>();

// --- Valid status transitions ---

const VALID_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  detected: ["escalated", "acknowledged"],
  escalated: ["acknowledged"],
  acknowledged: ["resolved"],
  resolved: [],
};

// --- CRUD ---

interface CreateAlertPayload {
  cameraId: string;
  cameraLabel: string;
  patientName: string;
  imagePath: string;
  location: string;
}

export function createAlert(payload: CreateAlertPayload): Alert {
  const now = new Date().toISOString();
  const alert: Alert = {
    id: randomUUID(),
    timestamp: now,
    location: payload.location,
    status: "detected",
    cameraId: payload.cameraId,
    cameraLabel: payload.cameraLabel,
    patientName: payload.patientName,
    imagePath: payload.imagePath,
    timeline: [
      {
        timestamp: now,
        event: "fall_detected",
        detail: `Detected by ${payload.cameraLabel}`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  alerts.set(alert.id, alert);
  return alert;
}

export function getAlert(id: string): Alert | null {
  return alerts.get(id) ?? null;
}

export function listAlerts(): Alert[] {
  return Array.from(alerts.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function updateAlertStatus(id: string, newStatus: AlertStatus): Alert {
  const alert = alerts.get(id);
  if (!alert) {
    throw new Error("Alert not found");
  }

  if (!VALID_TRANSITIONS[alert.status].includes(newStatus)) {
    throw new Error("Invalid status transition");
  }

  const now = new Date().toISOString();
  alert.status = newStatus;
  alert.updatedAt = now;
  alert.timeline.push({ timestamp: now, event: newStatus });

  return alert;
}

export function addTimelineEntry(
  id: string,
  event: string,
  detail?: string
): Alert {
  const alert = alerts.get(id);
  if (!alert) {
    throw new Error("Alert not found");
  }

  const now = new Date().toISOString();
  alert.timeline.push({ timestamp: now, event, detail });
  alert.updatedAt = now;

  return alert;
}

// --- Rate Limiter ---

export function checkRateLimit(
  cameraId: string,
  cooldownSeconds: number
): boolean {
  const last = rateLimitMap.get(cameraId);
  if (last === undefined) return true;
  return Date.now() - last >= cooldownSeconds * 1000;
}

export function recordAlert(cameraId: string): void {
  rateLimitMap.set(cameraId, Date.now());
}
