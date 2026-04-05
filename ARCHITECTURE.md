# Architecture — FallGuard

High-level technical architecture for the codebase. This document defines the system boundaries, communication contracts, data models, and directory structure so all three contributors can work concurrently with minimal merge conflicts.

---

## 1. System Diagram

All three components run on the **same Rubik device**. Communication is over localhost.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            RUBIK DEVICE                                      │
│                                                                              │
│  ┌──────────────────────────┐                                                │
│  │    Fall Detection Model   │                                               │
│  │                          │                                                │
│  │  [Camera] → [Model]     │                                                │
│  │       │                  │                                                │
│  │  Writes image to disk:  │                                                │
│  │  /shared/fall-images/   │                                                │
│  │       │                  │                                                │
│  │  POST localhost:3000    │                                                │
│  │  /api/fall-detected     │                                                │
│  │  (metadata only)        │                                                │
│  └───────────┬──────────────┘                                                │
│              │                                                               │
│              ▼                                                               │
│  ┌──────────────────────────────────────────┐                                │
│  │         Next.js App (localhost:3000)      │                               │
│  │                                          │                                │
│  │  /api/fall-detected   POST  ← from model │                               │
│  │  /api/alerts          GET   ← list alerts│                               │
│  │  /api/alerts/:id      PATCH ← ack/resolve│                               │
│  │  /api/alerts/stream   SSE   ← real-time  │                               │
│  │  /api/config          GET   ← profile    │                               │
│  │  /fall-images/*       GET   ← static imgs│                               │
│  │                                          │                                │
│  │  ┌────────────┐  ┌───────────────────┐   │                                │
│  │  │ Alert Store │  │ OpenClaw Client   │   │                               │
│  │  │ (in-memory) │  │ POST to webhook   │   │                               │
│  │  └────────────┘  └─────────┬─────────┘   │                               │
│  │                            │             │                                │
│  │  ┌─────────────────────────────────────┐ │                                │
│  │  │      Dashboard (React Frontend)     │ │                                │
│  │  │  [Alert Feed] [Alert Detail] [Imgs] │ │                                │
│  │  └─────────────────────────────────────┘ │                                │
│  └──────────────────────────┬───────────────┘                                │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────┐                                │
│  │      OpenClaw Agent (localhost:18789)     │                                │
│  │                                          │                                │
│  │  Receives webhook from Next.js           │                                │
│  │  Fetches image from localhost:3000       │                                │
│  │  Analyzes with Claude Sonnet (vision)    │                                │
│  │  Sends alert to configured channels:     │                                │
│  │  → Telegram / WhatsApp / Slack / Discord │                                │
│  └──────────────────────────────────────────┘                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  ┌──────────────┐
                  │  Qualcomm     │
                  │  Phone        │
                  │  - Receives   │
                  │    alerts via │
                  │    messaging  │
                  │  - Dashboard  │
                  │    via browser│
                  └──────────────┘
```

---

## 2. The Three Components

### Component 1 — Fall Detection Model
- Runs on the Rubik device with camera attached.
- Detects falls using MediaPipe Pose (or a custom model).
- On confirmed fall: writes a snapshot image to `/shared/fall-images/fall-<timestamp>.jpg`.
- POSTs metadata to `http://localhost:3000/api/fall-detected` (no image in the payload — it's already on disk).
- Authenticated via `X-Camera-Secret` header.

### Component 2 — Next.js Web App (Middleware + Dashboard)
- Runs on the Rubik device at `localhost:3000`.
- **Middleware role**: receives fall metadata from the model, stores the alert, triggers the OpenClaw webhook.
- **Dashboard role**: serves the frontend for viewing alerts, images, and acknowledging events.
- **Static file server**: serves fall images from `/public/fall-images/` (symlinked to `/shared/fall-images/`).
- Has **no knowledge** of which notification channel OpenClaw uses — it just fires the webhook.

### Component 3 — OpenClaw Agent
- Runs on the Rubik device at `localhost:18789`.
- Receives webhook POSTs from Next.js with a structured message + image URL.
- Fetches the image from `localhost:3000/fall-images/<filename>`.
- Uses Claude Sonnet (vision) to analyze the image and compose a human-readable alert.
- Delivers alerts to all configured channels (Telegram, WhatsApp, Slack, Discord, etc.).
- **All notification routing is configured in OpenClaw** — zero changes to Next.js needed to add/change channels.

---

## 3. Repo Structure

```
fallguard/
├── edge/                           # Fall detection model — Python
│   ├── detect.py                   # Main: capture → detect → write image → POST metadata
│   ├── fall_classifier.py          # Fall classification logic
│   ├── config.py                   # Camera index, server URL, thresholds, shared image dir
│   ├── requirements.txt            # mediapipe, opencv-python, requests
│   └── test_video/                 # Pre-recorded fall clips for backup demo
│       └── fall_simulation.mp4
│
├── web/                            # Next.js app — middleware + dashboard
│   ├── package.json
│   ├── .env.local                  # OPENCLAW_*, CAMERA_SECRET, BASE_URL (gitignored)
│   ├── .env.example                # Template for .env.local
│   ├── next.config.ts
│   │
│   ├── public/
│   │   └── fall-images/            # Symlink to /shared/fall-images/ (gitignored)
│   │
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Dashboard home — alert feed
│   │   │   ├── alerts/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # Alert detail view (image + timeline)
│   │   │   └── api/
│   │   │       ├── fall-detected/
│   │   │       │   └── route.ts          # POST — receives metadata from model, triggers OpenClaw
│   │   │       ├── alerts/
│   │   │       │   ├── route.ts          # GET (list alerts)
│   │   │       │   ├── [id]/
│   │   │       │   │   └── route.ts      # PATCH (ack/resolve)
│   │   │       │   └── stream/
│   │   │       │       └── route.ts      # SSE endpoint for real-time dashboard push
│   │   │       └── config/
│   │   │           └── route.ts          # GET deployment profile
│   │   │
│   │   ├── lib/
│   │   │   ├── alerts.ts                 # In-memory alert store + CRUD
│   │   │   ├── openclaw.ts               # POST to OpenClaw webhook with timeout
│   │   │   ├── events.ts                 # SSE event bus (EventEmitter)
│   │   │   └── profiles.ts              # Load deployment profiles
│   │   │
│   │   ├── components/
│   │   │   ├── AlertFeed.tsx             # Live-updating alert list
│   │   │   ├── AlertDetail.tsx           # Single alert — image, timeline, actions
│   │   │   ├── StatusBar.tsx             # Connection status, current profile
│   │   │   └── AckButton.tsx             # Acknowledge / resolve action button
│   │   │
│   │   └── types/
│   │       └── index.ts                  # Shared TypeScript types
│   │
│   └── profiles/
│       ├── hospital.json
│       ├── hospice.json
│       └── home.json
│
├── openclaw/                       # OpenClaw agent config (separate setup)
│   └── (OpenClaw's own config files — channels, contacts, routing)
│
└── README.md
```

---

## 4. Data Models

### Alert

```typescript
type AlertStatus = "detected" | "escalated" | "acknowledged" | "resolved";

interface Alert {
  id: string;                    // uuid
  timestamp: string;             // ISO 8601
  location: string;              // from deployment profile
  status: AlertStatus;
  cameraId: string;              // which camera triggered the alert
  cameraLabel: string;           // human-readable camera name
  patientName: string;           // patient identifier (if known)
  imagePath: string;             // e.g., "/fall-images/fall-1712345678.jpg"
  timeline: TimelineEntry[];     // log of every state change and notification
  createdAt: string;
  updatedAt: string;
}

interface TimelineEntry {
  timestamp: string;
  event: string;                 // "fall_detected" | "openclaw_notified" | "acknowledged" | "resolved"
  detail?: string;
}
```

### Model → Next.js Payload (POST /api/fall-detected)

```json
{
  "cameraId": "cam-01",
  "cameraLabel": "Living Room Camera 3",
  "patientName": "Taha",
  "imagePath": "/fall-images/fall-1712345678.jpg"
}
```

Headers: `X-Camera-Secret: <shared secret>`

### Next.js → OpenClaw Payload (POST localhost:18789/hooks/agent)

```json
{
  "message": "FALL ALERT — Captured by Living Room Camera 3. Patient: Taha has fallen. Please fetch and analyze this image: http://localhost:3000/fall-images/fall-1712345678.jpg Describe exactly what you see — the patient's position, any objects nearby, and your assessment of urgency. Then send an immediate alert to: family, nurse-on-duty."
}
```

Headers: `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>`

### Deployment Profile

```json
{
  "name": "hospital",
  "displayName": "Hospital — ER",
  "location": "ER Waiting Room",
  "contacts": {
    "primary": { "name": "Nurse Station", "role": "nurse-on-duty" },
    "escalation": { "name": "Dr. Smith", "role": "family" }
  },
  "thresholds": {
    "cooldown_seconds": 10,
    "fall_confirmation_seconds": 3
  }
}
```

Note: contact delivery details (phone numbers, channels) are configured in OpenClaw, not here. The profile only defines roles and labels.

---

## 5. Communication Contracts

### Model → Next.js: Fall Detected
- **Protocol**: HTTP POST
- **Endpoint**: `http://localhost:3000/api/fall-detected`
- **Auth**: `X-Camera-Secret` header
- **When**: Fall model confirms a fall and has written the image to disk
- **Payload**: metadata only (cameraId, cameraLabel, patientName, imagePath)
- **Rate limit**: Next.js enforces a 10-second cooldown per cameraId

### Next.js → OpenClaw: Webhook
- **Protocol**: HTTP POST
- **Endpoint**: `http://localhost:18789/hooks/agent`
- **Auth**: `Authorization: Bearer <token>`
- **When**: New alert is created in the alert store
- **Timeout**: 5 seconds — if OpenClaw is unreachable, log error but don't block
- **Payload**: structured message with image URL for OpenClaw to fetch

### Next.js → Browser: SSE
- **Protocol**: Server-Sent Events
- **Endpoint**: `GET /api/alerts/stream`
- **When**: Any alert is created or its status changes
- Dashboard listens to update the alert feed in real-time.

### Next.js → Browser: Static Images
- **Protocol**: HTTP GET
- **Endpoint**: `/fall-images/<filename>.jpg`
- **Served from**: `/public/fall-images/` (symlinked to `/shared/fall-images/`)

### OpenClaw → Messaging Channels
- **Protocol**: Configured per channel in OpenClaw
- **Channels**: Telegram, WhatsApp, Slack, Discord, etc.
- **When**: OpenClaw processes the webhook and completes image analysis
- **Next.js has no visibility into this** — it's entirely OpenClaw's domain

---

## 6. Workstream Split (3 People)

| Person | Component | Owns | Integration Point |
|--------|-----------|------|-------------------|
| **P1 — Model** | `edge/` | Camera capture, fall detection, image writer, metadata POSTer | Agrees on POST payload shape + `X-Camera-Secret` with P2 |
| **P2 — Web App** | `web/src/app/api/`, `web/src/lib/` | API routes, alert store, OpenClaw webhook client, SSE, profiles, rate limiter | Agrees on payload with P1; agrees on API response shapes with P3 |
| **P3 — Frontend** | `web/src/app/page.tsx`, `web/src/app/alerts/`, `web/src/components/` | Dashboard UI, alert feed, alert detail (with fall image), ack/resolve, mobile layout | Develops against mock data until P2's API is live |

**OpenClaw setup** is a separate task (configuring channels, contacts, routing) that any team member can handle. It doesn't involve writing code in this repo.

### Parallel Development Strategy
- P1 develops on the Rubik device with the camera. Tests by POSTing to a simple echo server or directly to P2's endpoint.
- P2 and P3 both work in `web/` but in different directories. Merge conflicts should be rare.
- P3 starts with hardcoded mock alerts and a test image. Swaps to real API calls once P2's endpoints are up.
- OpenClaw can be tested independently by manually POSTing to its webhook.

---

## 7. Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model language | Python | MediaPipe + OpenCV are Python-native |
| Web framework | Next.js (App Router) | Unified frontend + backend on one port. API routes for middleware, React for dashboard |
| Database | In-memory Map | Hackathon — no persistence needed. Single device, single process |
| Real-time updates | SSE | One-directional server→client push, no extra library |
| Notifications | OpenClaw → configured channels | Next.js is channel-agnostic. Adding a channel = OpenClaw config change, zero code |
| Image analysis | Claude Sonnet via OpenClaw | Vision model analyzes the fall image and composes the alert message |
| Image serving | Symlink /shared → /public | Model writes to shared dir, Next.js serves it as static files |
| Styling | Tailwind CSS | Ships with Next.js, fast to prototype |
| Auth (model → Next.js) | Shared secret header | Simple, sufficient for single-device localhost communication |

---

## 8. Environment Variables

```env
# web/.env.local
OPENCLAW_GATEWAY_TOKEN=<token>
OPENCLAW_WEBHOOK_URL=http://localhost:18789/hooks/agent
BASE_URL=http://localhost:3000
CAMERA_SECRET=<shared secret between fall model and Next.js>
ACTIVE_PROFILE=hospital

# edge/config.py
CAMERA_INDEX=0
SERVER_URL=http://localhost:3000
CAMERA_SECRET=<same shared secret>
SHARED_IMAGE_DIR=/shared/fall-images
```

---

## 9. Getting Started

```bash
# 1 — Symlink shared image directory
ln -s /shared/fall-images ./web/public/fall-images

# 2 — Start OpenClaw (separate process)
# (follow OpenClaw setup docs — configure channels, contacts, gateway token)

# 3 — Start Next.js
cd web
npm install
cp .env.example .env.local    # fill in OPENCLAW_GATEWAY_TOKEN, CAMERA_SECRET
npm run dev                    # starts on http://localhost:3000

# 4 — Start fall detection model
cd edge
pip install -r requirements.txt
python detect.py               # or: python detect.py --source test_video/fall_simulation.mp4

# 5 — Open dashboard
# Browser → http://localhost:3000
# Phone → http://<RUBIK_IP>:3000
```

---

## 10. What Changed From the Original Architecture

| Before | After | Why |
|--------|-------|-----|
| Split across Rubik Pi + PC | Everything on one Rubik device | Matches actual deployment — single device simplifies networking |
| Twilio WhatsApp in Next.js | OpenClaw handles all notifications | OpenClaw is channel-agnostic — add channels via config, not code |
| Email via Nodemailer in Next.js | OpenClaw handles email too | Same reason — notification routing belongs in OpenClaw |
| Escalation engine with timers | Removed from Next.js | OpenClaw handles urgency + delivery. Next.js just fires the webhook |
| Pose landmarks over WebSocket | Model writes images to disk | Simpler — image on disk is more useful (OpenClaw can analyze it) |
| PoseOverlay canvas component | Removed — show actual fall image | The fall image is more compelling for the demo than a wireframe |
| Next.js manages contacts/channels | Next.js is channel-agnostic | Contacts and channels are OpenClaw config, not web app config |
