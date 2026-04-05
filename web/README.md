# FallGuard — Web App

Next.js app that acts as middleware between the fall detection model and OpenClaw, and serves the monitoring dashboard. Everything runs on the Rubik device.

## Prerequisites

- Node.js 18+
- npm
- OpenClaw running at `localhost:18789`
- Fall images symlinked: `ln -s /shared/fall-images ./public/fall-images`

## Setup

```bash
cd web
npm install
cp .env.example .env.local   # fill in OPENCLAW_GATEWAY_TOKEN, CAMERA_SECRET
ln -s /shared/fall-images ./public/fall-images
```

## Run

```bash
npm run dev
```

Opens at http://localhost:3000

## Test the API

### Simulate a fall detection (what the model sends)

```bash
curl -X POST http://localhost:3000/api/fall-detected \
  -H "Content-Type: application/json" \
  -H "X-Camera-Secret: <your-secret>" \
  -d '{
    "cameraId": "cam-01",
    "cameraLabel": "Living Room Camera 3",
    "patientName": "Taha",
    "imagePath": "/fall-images/fall-1712345678.jpg"
  }'
```

### List alerts

```bash
curl http://localhost:3000/api/alerts
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

This stays open. In another terminal, trigger a fall — you should see it stream through.

### Verify image serving

```bash
curl http://localhost:3000/fall-images/fall-<timestamp>.jpg
```

## Project Structure

```
web/
├── profiles/                          # Deployment configs (hospital/hospice/home)
├── public/
│   └── fall-images/                   # Symlink to /shared/fall-images/ (gitignored)
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Dashboard home
│   │   ├── alerts/[id]/page.tsx       # Alert detail page
│   │   └── api/
│   │       ├── fall-detected/route.ts # POST — receives metadata from model, triggers OpenClaw
│   │       ├── alerts/route.ts        # GET — list alerts
│   │       ├── alerts/[id]/route.ts   # PATCH — ack/resolve
│   │       ├── alerts/stream/route.ts # SSE — real-time push
│   │       └── config/route.ts        # GET — active profile
│   ├── components/                    # React UI components
│   ├── lib/
│   │   ├── alerts.ts                  # In-memory alert store
│   │   ├── openclaw.ts                # OpenClaw webhook client
│   │   ├── events.ts                  # SSE event bus
│   │   └── profiles.ts               # Profile loader
│   └── types/index.ts                 # Shared TypeScript types
└── .env.example                       # Environment variable template
```

## How It Flows

1. Fall model detects a fall, writes image to `/shared/fall-images/`, POSTs metadata to `/api/fall-detected`
2. Next.js validates the secret, stores the alert, fires a webhook to OpenClaw
3. OpenClaw fetches the image from `localhost:3000/fall-images/...`, analyzes with Claude Sonnet, sends alert to configured channels
4. Dashboard updates in real-time via SSE
