# Architecture — FallGuard

High-level technical architecture for the codebase. This document defines the system boundaries, communication contracts, data models, and directory structure so all three contributors can work concurrently with minimal merge conflicts.

---

## 1. System Diagram

```
┌─────────────────────────────────────┐      ┌──────────────────────────────────────────────────┐
│          RUBIK PI (Edge)            │      │                   PC (Server)                     │
│                                     │      │                                                    │
│  [Camera] → [OpenCV Capture]        │      │  ┌──────────────────────────────────────────────┐  │
│               │                     │      │  │           Next.js App                         │  │
│         [MediaPipe Pose]            │      │  │                                              │  │
│               │                     │      │  │  /api/alerts      POST   ← receive alerts    │  │
│         [Fall Classifier]           │ HTTP │  │  /api/alerts      GET    ← list alerts       │  │
│               │                     │─────▶│  │  /api/alerts/:id  PATCH  ← ack/resolve       │  │
│         [Alert Sender]              │      │  │  /api/alerts/stream SSE  ← real-time push    │  │
│               │                     │      │  │  /api/config      GET    ← deployment profile│  │
│         [Pose Stream (WS)]─────────▶│      │  │                                              │  │
│                                     │      │  │  ┌────────────┐  ┌───────────┐  ┌─────────┐  │  │
└─────────────────────────────────────┘      │  │  │ Escalation │  │  Twilio   │  │  Email  │  │  │
                                             │  │  │  Engine    │──│ WhatsApp  │  │ Sender  │  │  │
                                             │  │  └────────────┘  └───────────┘  └─────────┘  │  │
                                             │  │                                              │  │
                                             │  │  ┌────────────┐                              │  │
                                             │  │  │  OpenClaw   │ ← conversational queries    │  │
                                             │  │  │  Service    │                              │  │
                                             │  │  └────────────┘                              │  │
                                             │  └──────────────────────────────────────────────┘  │
                                             │                                                    │
                                             │  ┌──────────────────────────────────────────────┐  │
                                             │  │         Frontend (React/Next.js)              │  │
                                             │  │                                              │  │
                                             │  │  [Live Pose Overlay] [Alert Feed] [OpenClaw] │  │
                                             │  └──────────────────────────────────────────────┘  │
                                             └──────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │  Qualcomm     │
                                                  │  Phone        │
                                                  │  - WhatsApp   │
                                                  │  - Dashboard  │
                                                  └──────────────┘
```

---

## 2. Repo Structure

```
fallguard/
├── edge/                        # Runs on Rubik Pi — Python
│   ├── detect.py                # Main entry point: capture → pose → classify → send
│   ├── fall_classifier.py       # Fall classification logic (thresholds, state tracking)
│   ├── pose_stream.py           # WebSocket server to stream pose landmarks to dashboard
│   ├── config.py                # Pi-side config (camera index, server URL, thresholds)
│   ├── requirements.txt         # mediapipe, opencv-python, requests, websockets
│   └── test_video/              # Pre-recorded fall clips for backup demo
│       └── fall_simulation.mp4
│
├── web/                         # Runs on PC — Next.js (frontend + backend)
│   ├── package.json
│   ├── .env.example             # TWILIO_*, EMAIL_*, OPENCLAW_*, PI_WS_URL
│   ├── next.config.js
│   │
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Dashboard home — alert feed + live overlay
│   │   │   ├── alerts/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # Alert detail view
│   │   │   └── api/
│   │   │       ├── alerts/
│   │   │       │   ├── route.ts          # GET (list) + POST (create from Pi)
│   │   │       │   ├── [id]/
│   │   │       │   │   └── route.ts      # PATCH (ack/resolve)
│   │   │       │   └── stream/
│   │   │       │       └── route.ts      # SSE endpoint for real-time alert push
│   │   │       ├── config/
│   │   │       │   └── route.ts          # GET deployment profile
│   │   │       └── webhooks/
│   │   │           └── twilio/
│   │   │               └── route.ts      # Inbound WhatsApp reply handler
│   │   │
│   │   ├── lib/
│   │   │   ├── alerts.ts                 # In-memory alert store + CRUD
│   │   │   ├── escalation.ts             # State machine + timer logic
│   │   │   ├── twilio.ts                 # Send WhatsApp message via Twilio
│   │   │   ├── email.ts                  # Send email via Nodemailer/SendGrid
│   │   │   ├── openclaw.ts               # OpenClaw client — feed alert context, query
│   │   │   └── profiles.ts               # Load deployment profiles from config
│   │   │
│   │   ├── components/
│   │   │   ├── AlertFeed.tsx             # Live-updating alert list
│   │   │   ├── AlertDetail.tsx           # Single alert — timeline, pose overlay, actions
│   │   │   ├── PoseOverlay.tsx           # Canvas component rendering skeleton from WS data
│   │   │   ├── StatusBar.tsx             # Camera connected, last processed, current profile
│   │   │   ├── OpenClawChat.tsx          # Chat UI for OpenClaw interaction
│   │   │   └── AckButton.tsx             # Acknowledge / resolve action button
│   │   │
│   │   └── types/
│   │       └── index.ts                  # Shared TypeScript types (Alert, PoseLandmarks, etc.)
│   │
│   └── profiles/
│       ├── hospital.json
│       ├── hospice.json
│       └── home.json
│
└── README.md
```

---

## 3. Data Models

### Alert

```typescript
type AlertStatus = "detected" | "escalated" | "acknowledged" | "resolved";

interface Alert {
  id: string;                    // uuid
  timestamp: string;             // ISO 8601
  location: string;              // from deployment profile (e.g., "Room 3 — Patient Bed")
  status: AlertStatus;
  confidence: number;            // 0-1, how confident the classifier is
  poseLandmarks: PoseLandmark[]; // 33 landmarks at time of detection
  timeline: TimelineEntry[];     // log of every state change and notification
  createdAt: string;
  updatedAt: string;
}

interface PoseLandmark {
  x: number;  // 0-1 normalized
  y: number;
  z: number;
  visibility: number;
}

interface TimelineEntry {
  timestamp: string;
  event: string;                 // "fall_detected" | "whatsapp_sent" | "escalated" | "email_sent" | "acknowledged" | "resolved" | "patient_recovered"
  detail?: string;               // e.g., "Sent to +1234567890" or "Nurse replied ACK"
}
```

### Deployment Profile

```json
{
  "name": "hospital",
  "location": "ER Waiting Room",
  "contacts": {
    "primary": {
      "name": "Nurse Station",
      "whatsapp": "+1234567890"
    },
    "escalation": {
      "name": "Dr. Smith",
      "email": "dr.smith@hospital.org"
    }
  },
  "thresholds": {
    "escalation_timeout_seconds": 60,
    "fall_confirmation_seconds": 3
  }
}
```

### Pi → Server Alert Payload (POST /api/alerts)

```json
{
  "timestamp": "2026-04-05T14:32:01Z",
  "confidence": 0.87,
  "poseLandmarks": [ { "x": 0.5, "y": 0.8, "z": 0.1, "visibility": 0.99 }, ... ],
  "metrics": {
    "hip_height": 0.15,
    "torso_angle": 72.3,
    "stillness": 0.02
  }
}
```

---

## 4. Communication Contracts

### Pi → PC: Alert
- **Protocol**: HTTP POST
- **Endpoint**: `http://<PC_IP>:3000/api/alerts`
- **When**: Fall classifier transitions to CONFIRMED_FALL
- **Payload**: see above

### Pi → PC: Live Pose Stream
- **Protocol**: WebSocket
- **Endpoint**: `ws://<PI_IP>:8765`
- **When**: Every processed frame (1-2 fps)
- **Payload**: `{ "landmarks": PoseLandmark[], "classification": "normal" | "possible_fall" | "confirmed_fall", "metrics": { ... } }`
- Dashboard connects to this WS to render the live skeleton overlay.

### PC → Phone: WhatsApp
- **Protocol**: Twilio REST API
- **When**: Alert status transitions to `detected` or `escalated`
- **Inbound**: Twilio webhook at `POST /api/webhooks/twilio` handles nurse reply ("ACK")

### PC → Dashboard: Real-time Updates
- **Protocol**: Server-Sent Events (SSE)
- **Endpoint**: `GET /api/alerts/stream`
- **When**: Any alert is created or its status changes
- Dashboard listens on SSE to update the alert feed without polling.

### PC → OpenClaw
- **Protocol**: OpenClaw SDK (API calls)
- **When**: User sends a message in the OpenClaw chat component
- **Context**: The current alert data (or all recent alerts) is injected into the OpenClaw prompt so it can answer questions about the event.

---

## 5. Workstream Split (3 People)

The repo is split so each person owns a directory/domain with minimal overlap.

| Person | Domain | Owns | Touches |
|--------|--------|------|---------|
| **P1 — Edge** | `edge/` | Camera capture, MediaPipe Pose, fall classifier, alert sender, pose WS server | Nothing in `web/` — communicates only via HTTP + WS |
| **P2 — Backend** | `web/src/app/api/`, `web/src/lib/` | API routes, alert store, escalation engine, Twilio integration, email sender, OpenClaw service, deployment profiles | `web/src/types/` (shared types) |
| **P3 — Frontend** | `web/src/app/page.tsx`, `web/src/app/alerts/`, `web/src/components/` | Dashboard UI, alert feed, alert detail, pose overlay canvas, OpenClaw chat UI, mobile responsiveness | `web/src/types/` (shared types) |

### Integration Points (agree on these first)
1. **P1 ↔ P2**: The `POST /api/alerts` payload shape and the WebSocket message format. Define these up front and P1 can develop against a mock server, P2 against a mock payload.
2. **P2 ↔ P3**: The API response shapes (`GET /api/alerts`, `PATCH /api/alerts/:id`, SSE event format). P3 can develop against hardcoded mock data while P2 builds the real endpoints.
3. **All**: The `Alert` and `PoseLandmark` types in `web/src/types/index.ts` — agree on these before anyone starts coding.

### Parallel Development Strategy
- P1 works entirely on the Rubik Pi. Can test by POSTing to a simple echo server or directly to P2's endpoint once it exists.
- P2 and P3 both work in `web/` but in different directories. P2 owns `api/` and `lib/`, P3 owns `components/` and page files. Merge conflicts should be rare.
- P3 starts with hardcoded mock alerts to build the UI. Swaps to real API calls once P2's endpoints are up.

---

## 6. Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edge language | Python | MediaPipe + OpenCV are Python-native. Nexa SDK supports Python. |
| Web framework | Next.js 14 (App Router) | Unified frontend + backend. API routes for the backend, React for the frontend. One `npm run dev`. |
| Database | In-memory array (or SQLite if needed) | Hackathon — no persistence needed across restarts. SQLite as fallback if we want persistence without setup. |
| Real-time dashboard updates | SSE (Server-Sent Events) | Simpler than WebSocket for one-directional server→client push. No extra library needed. |
| Live pose stream | WebSocket from Pi | Bidirectional not needed, but WS is the simplest way to stream frame-rate data from Pi to browser. Pi runs a tiny WS server, browser connects directly. |
| WhatsApp | Twilio WhatsApp Sandbox | Free, 15-min setup, supports inbound replies. |
| Email | Nodemailer + Gmail SMTP | Zero cost, no third-party signup needed beyond a Gmail app password. |
| OpenClaw | OpenClaw SDK | Required by hackathon. Embed as chat component. |
| Styling | Tailwind CSS | Ships with Next.js, fast to prototype, no component library overhead. |

---

## 7. Environment Variables

```env
# Pi (edge/config.py)
CAMERA_INDEX=0                          # 0 for default USB/CSI camera
SERVER_URL=http://192.168.1.100:3000    # PC's IP on local network
WS_PORT=8765                            # WebSocket server port for pose stream

# PC (web/.env)
PI_WS_URL=ws://192.168.1.50:8765        # Rubik Pi's IP + WS port

TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Twilio sandbox number
NURSE_WHATSAPP_TO=whatsapp:+1234567890

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=fallguard.alerts@gmail.com
EMAIL_PASS=xxx                           # Gmail app password
EMAIL_TO=doctor@hospital.org

OPENCLAW_API_KEY=xxx

ACTIVE_PROFILE=hospital                  # hospital | hospice | home
```

---

## 8. Getting Started (Target)

```bash
# Terminal 1 — Rubik Pi
cd edge
pip install -r requirements.txt
python detect.py                    # or: python detect.py --source test_video/fall_simulation.mp4

# Terminal 2 — PC
cd web
npm install
cp .env.example .env               # fill in credentials
npm run dev                         # starts on http://localhost:3000

# Open browser → http://localhost:3000
# Open phone browser → http://<PC_IP>:3000
```
