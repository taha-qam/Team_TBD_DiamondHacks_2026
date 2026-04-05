export type AlertStatus = "detected" | "escalated" | "acknowledged" | "resolved";

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface TimelineEntry {
  timestamp: string;
  event: string;
  detail?: string;
}

export interface Alert {
  id: string;
  timestamp: string;
  location: string;
  status: AlertStatus;
  confidence: number;
  poseLandmarks: PoseLandmark[];
  metrics: {
    hip_height: number;
    torso_angle: number;
    stillness: number;
  };
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  name: string;
  whatsapp?: string;
  email?: string;
}

export interface DeploymentProfile {
  name: string;
  displayName: string;
  location: string;
  contacts: {
    primary: Contact;
    escalation: Contact;
  };
  thresholds: {
    escalation_timeout_seconds: number;
    fall_confirmation_seconds: number;
  };
}
