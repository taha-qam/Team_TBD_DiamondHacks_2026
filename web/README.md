# FallGuard — Web App

Next.js app that serves the dashboard frontend and backend API for the FallGuard fall detection system.

## Prerequisites

- Node.js 18+ (we're using v24)
- npm

## Setup

```bash
cd web
npm install
cp .env.example .env   # fill in credentials (optional for local dev)
```

## Run

```bash
npm run dev
```

Opens at http://localhost:3000

## Test the API

All routes currently return stub responses (`501 Not Implemented`). As specs are implemented, use these commands to test:

### List alerts

```bash
curl http://localhost:3000/api/alerts
```

### Create an alert (simulates what the Rubik Pi sends)

```bash
curl -X POST http://localhost:3000/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-04-05T14:32:01Z",
    "confidence": 0.87,
    "poseLandmarks": [
      {"x": 0.5, "y": 0.2, "z": 0.1, "visibility": 0.99},
      {"x": 0.48, "y": 0.22, "z": 0.1, "visibility": 0.98},
      {"x": 0.52, "y": 0.21, "z": 0.1, "visibility": 0.97},
      {"x": 0.53, "y": 0.23, "z": 0.1, "visibility": 0.96},
      {"x": 0.47, "y": 0.23, "z": 0.1, "visibility": 0.95},
      {"x": 0.55, "y": 0.30, "z": 0.1, "visibility": 0.99},
      {"x": 0.45, "y": 0.30, "z": 0.1, "visibility": 0.99},
      {"x": 0.58, "y": 0.40, "z": 0.1, "visibility": 0.98},
      {"x": 0.42, "y": 0.40, "z": 0.1, "visibility": 0.98},
      {"x": 0.60, "y": 0.48, "z": 0.1, "visibility": 0.97},
      {"x": 0.40, "y": 0.48, "z": 0.1, "visibility": 0.97},
      {"x": 0.54, "y": 0.50, "z": 0.1, "visibility": 0.99},
      {"x": 0.46, "y": 0.50, "z": 0.1, "visibility": 0.99},
      {"x": 0.55, "y": 0.51, "z": 0.1, "visibility": 0.98},
      {"x": 0.45, "y": 0.51, "z": 0.1, "visibility": 0.98},
      {"x": 0.53, "y": 0.18, "z": 0.1, "visibility": 0.96},
      {"x": 0.47, "y": 0.18, "z": 0.1, "visibility": 0.96},
      {"x": 0.54, "y": 0.17, "z": 0.1, "visibility": 0.95},
      {"x": 0.46, "y": 0.17, "z": 0.1, "visibility": 0.95},
      {"x": 0.55, "y": 0.17, "z": 0.1, "visibility": 0.94},
      {"x": 0.45, "y": 0.17, "z": 0.1, "visibility": 0.94},
      {"x": 0.53, "y": 0.19, "z": 0.1, "visibility": 0.93},
      {"x": 0.47, "y": 0.19, "z": 0.1, "visibility": 0.93},
      {"x": 0.54, "y": 0.65, "z": 0.1, "visibility": 0.99},
      {"x": 0.46, "y": 0.65, "z": 0.1, "visibility": 0.99},
      {"x": 0.55, "y": 0.80, "z": 0.1, "visibility": 0.98},
      {"x": 0.45, "y": 0.80, "z": 0.1, "visibility": 0.98},
      {"x": 0.56, "y": 0.90, "z": 0.1, "visibility": 0.97},
      {"x": 0.44, "y": 0.90, "z": 0.1, "visibility": 0.97},
      {"x": 0.57, "y": 0.93, "z": 0.1, "visibility": 0.96},
      {"x": 0.43, "y": 0.93, "z": 0.1, "visibility": 0.96},
      {"x": 0.58, "y": 0.95, "z": 0.1, "visibility": 0.95},
      {"x": 0.42, "y": 0.95, "z": 0.1, "visibility": 0.95}
    ],
    "metrics": {
      "hip_height": 0.15,
      "torso_angle": 72.3,
      "stillness": 0.02
    }
  }'
```

### Acknowledge an alert

```bash
curl -X PATCH http://localhost:3000/api/alerts/<ALERT_ID> \
  -H "Content-Type: application/json" \
  -d '{"status": "acknowledged"}'
```

### Get deployment profile

```bash
curl http://localhost:3000/api/config
```

### Listen to real-time events (SSE)

```bash
curl -N http://localhost:3000/api/alerts/stream
```

This stays open. In another terminal, POST an alert — you should see it stream through.

## Project Structure

```
web/
├── profiles/                          # Deployment configs (hospital/hospice/home)
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Dashboard home
│   │   ├── alerts/[id]/page.tsx       # Alert detail page
│   │   └── api/
│   │       ├── alerts/route.ts        # POST + GET alerts
│   │       ├── alerts/[id]/route.ts   # PATCH ack/resolve
│   │       ├── alerts/stream/route.ts # SSE real-time push
│   ��       ├── config/route.ts        # GET active profile
│   │       └── webhooks/twilio/       # Inbound WhatsApp replies
│   ├── components/                    # React UI components
│   ├── lib/                           # Backend logic (store, escalation, notifications)
│   └── types/index.ts                 # Shared TypeScript types
└── .env.example                       # Environment variable template
```

## Specs

Implementation specs live in `/specs/` at the repo root. Each file in this project has a comment pointing to its corresponding spec.

| Spec | Covers |
|------|--------|
| `web-alert-store.md` | Types + in-memory CRUD |
| `web-api.md` | REST endpoints |
| `web-escalation-engine.md` | State machine + timed escalation |
| `web-notifications.md` | WhatsApp (Twilio) + email |
| `web-sse.md` | Real-time event streaming |
| `web-dashboard.md` | All frontend components |
| `web-profiles.md` | Deployment profile configs |
