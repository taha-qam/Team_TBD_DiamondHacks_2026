# Plan: Wire OpenClaw into CareWatch

The `web_app/carewatch/` app already has a working dashboard, patient registration, live camera feed, and file-based alert storage. The missing piece is connecting the fall detection pipeline to OpenClaw so alerts actually get delivered to Telegram.

The critical function is `notifyOpenClaw()` — it already exists at `src/lib/openclaw.ts` and is ready to go. We just need to call it from the right place and set up the env vars.

---

## Current State

**Already working:**
- `app/api/fall/route.ts` — stores alerts to `data/alerts.json` (GET + POST)
- `app/api/patients/route.ts` — stores patients to `data/patients.json`
- `app/dashboard/page.tsx` — renders patients, live feed, alert list with modal
- `src/lib/openclaw.ts` — `notifyOpenClaw()` function (ready, not called anywhere yet)

**Not working:**
- `src/app/api/fall-detected/route.ts` — stub returning 501
- `src/app/api/test-store/route.ts` — broken, imports `@/lib/alerts` which doesn't exist in this app
- `.env.local` — missing OpenClaw env vars

---

## Tasks

### Task 1 — Add env vars to `.env.local`

Add the OpenClaw and camera secret vars alongside the existing stream URL:

```env
NEXT_PUBLIC_STREAM_URL=http://localhost:8080

OPENCLAW_WEBHOOK_TOKEN=fallguard-hooks-token-2026
OPENCLAW_WEBHOOK_URL=http://localhost:18789/hooks/agent
TELEGRAM_CHAT_ID=8717301180
CAMERA_SECRET=fallguard-dev-secret
BASE_URL=http://localhost:3000
```

### Task 2 — Implement `/api/fall-detected` route

This is the endpoint the Pi model POSTs to. It should:

1. Validate `X-Camera-Secret` header → 401 if wrong
2. Parse the JSON body (`cameraId`, `cameraLabel`, `patientName`, `imagePath`)
3. Write the alert to `data/alerts.json` (matching the existing format the dashboard reads)
4. **Call `notifyOpenClaw()`** with a structured alert message
5. Return `200 { ok: true }`

The message to OpenClaw should be a simple description, not instructions:

```
"Fall detected — Patient: Taha, Location: Living Room, Camera: Living Room Camera. Immediate attention may be needed."
```

### Task 3 — Remove broken test-store route

`src/app/api/test-store/route.ts` imports from `@/lib/alerts` which doesn't exist in this app (the carewatch app uses file-based storage at `app/api/fall/route.ts` instead). Delete it to avoid build errors.

### Task 4 — Update test-endpoints.sh

Update the test script to match the carewatch app's actual routes and env var names.

### Task 5 — Test end-to-end

1. Start Next.js: `npm run dev` (on Rubik)
2. Run `curl http://localhost:3000/api/test-openclaw` → verify Telegram message arrives
3. Simulate a fall: `curl -X POST http://localhost:3000/api/fall-detected -H "X-Camera-Secret: fallguard-dev-secret" -H "Content-Type: application/json" -d '{"cameraId":"cam-01","cameraLabel":"Living Room Camera","patientName":"Taha","imagePath":"/fall-images/fall-123.jpg"}'`
4. Verify: alert appears in dashboard AND Telegram message arrives

---

## What This Does NOT Change

- The existing dashboard UI — it already reads from `data/alerts.json`, no changes needed
- The existing `/api/fall` route — still works for direct GET/POST, dashboard keeps using it
- The existing `/api/patients` route — untouched
- `src/lib/openclaw.ts` — already implemented and correct, just needs to be called

---

## Build Order

```
Task 1 (env vars)  →  Task 2 (fall-detected route)  →  Task 3 (cleanup)  →  Task 4 (test script)  →  Task 5 (test)
```

Task 2 is the only real code work. Everything else is config and cleanup.

---

## Manual Testing Reference

All testing runs on the **Rubik device** (ubuntu). The web app, OpenClaw, and the fall detection model all run on the same machine.

### Prerequisites

1. OpenClaw gateway is running at `localhost:18789`
2. `.env.local` in `web_app/carewatch/` has these vars:
   ```env
   NEXT_PUBLIC_STREAM_URL=http://localhost:8080
   OPENCLAW_WEBHOOK_TOKEN=fallguard-hooks-token-2026
   OPENCLAW_WEBHOOK_URL=http://localhost:18789/hooks/agent
   TELEGRAM_CHAT_ID=8717301180
   CAMERA_SECRET=fallguard-dev-secret
   BASE_URL=http://localhost:3000
   ```
3. Next.js is running: `npm run dev` from `web_app/carewatch/`

### Test Script

Run from `web_app/carewatch/` in a second terminal:

```bash
bash test-endpoints.sh
```

This tests all endpoints in sequence:
1. OpenClaw webhook → should trigger a Telegram message
2. List patients → shows registered patients from `data/patients.json`
3. List alerts → shows current alerts from `data/alerts.json`
4. Simulate fall → POSTs a new alert to `/api/fall`
5. Verify alert stored → lists alerts again to confirm

### Individual Curl Commands

**Test OpenClaw webhook (Telegram delivery):**
```bash
curl http://localhost:3000/api/test-openclaw
```
Expected: `{"ok":true}` + Telegram message arrives.

**List patients:**
```bash
curl http://localhost:3000/api/patients
```

**List alerts:**
```bash
curl http://localhost:3000/api/fall
```

**Simulate a fall alert:**
```bash
curl -X POST http://localhost:3000/api/fall -H "Content-Type: application/json" -d '{"timestamp":"2026-04-05T12:00:00Z","patient":{"id":"patient-1","name":"Taha"},"monitoring":{"location":"Living Room","cameraNumber":1},"imagePath":"/fall-images/fall-test.jpg"}'
```
Expected: `{"ok":true,"alert":{...}}` + alert appears in dashboard.

### Troubleshooting

- **`[OpenClaw dev mode] Would send:` in console** — `OPENCLAW_WEBHOOK_URL` is not set in `.env.local`. Add it and restart `npm run dev`.
- **`OpenClaw webhook failed: 401`** — `OPENCLAW_WEBHOOK_TOKEN` doesn't match the `hooks.token` in `openclaw.json`.
- **`OpenClaw webhook unreachable`** — OpenClaw gateway isn't running. Start it first.
- **Webhook returns `{"ok":true}` but no Telegram message** — Check that `TELEGRAM_CHAT_ID` is correct. Retrieve it via `openclaw doctor` on the Rubik.
- **OpenClaw flags message as prompt injection** — Rephrase the message as a simple alert description, not instructions (no "fetch this URL" or "send to these people").
