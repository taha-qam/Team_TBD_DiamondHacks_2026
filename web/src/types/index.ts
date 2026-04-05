export type AlertStatus = "detected" | "escalated" | "acknowledged" | "resolved";

export interface TimelineEntry {
  timestamp: string;
  event: string; // "fall_detected" | "openclaw_notified" | "acknowledged" | "resolved"
  detail?: string;
}

export interface Alert {
  id: string;
  timestamp: string;
  location: string;
  status: AlertStatus;
  cameraId: string;
  cameraLabel: string;
  patientName: string;
  imagePath: string; // e.g., "/fall-images/fall-1712345678.jpg"
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileContact {
  name: string;
  role: string; // e.g., "nurse-on-duty", "family"
}

export interface DeploymentProfile {
  name: string;
  displayName: string;
  location: string;
  contacts: {
    primary: ProfileContact;
    escalation: ProfileContact;
  };
  thresholds: {
    cooldown_seconds: number;
    fall_confirmation_seconds: number;
  };
}
