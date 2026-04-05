# CareWatch

Fall detection monitoring dashboard for DiamondHacks 2026.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000

## ngrok (remote access)

**On your laptop (Next.js):**
```bash
ngrok http 3000
```

**On the Pi (camera stream):**
```bash
ngrok http 8080
```

Then update `.env.local`:
```
NEXT_PUBLIC_STREAM_URL=https://<pi-ngrok-url>.ngrok-free.app
```

Restart Next.js after changing `.env.local`.

## Pi integration

The Pi's `on_fall` callback should POST to:
```
POST https://<laptop-ngrok-url>.ngrok-free.app/api/fall
```

With the payload from `fall_detection_pipeline.py` (timestamp, patient, monitoring, image).

## Architecture

```
Pi (camera + MediaPipe fall detection)
  └── POST /api/fall → Next.js
  └── MJPEG stream on :8080

Next.js (this app, on your laptop)
  ├── /dashboard       — live feed + alert history
  ├── /register        — add/configure patient
  ├── /api/patients    — patient CRUD (stored in data/patients.json)
  └── /api/fall        — receives fall payloads from Pi
```
