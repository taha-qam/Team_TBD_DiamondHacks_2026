# Implementation Proposal — FallGuard Web Pipeline

How to implement the Next.js middleware + dashboard in an orderly sequence. Each spec is a self-contained unit of work that can be tested before moving on.

---

## Build Order

The pipeline has a clear dependency chain. Build bottom-up:

```
Spec 1: Types + Alert Store       ← everything depends on this
Spec 2: OpenClaw Client           ← the webhook helper
Spec 3: /api/fall-detected        ← wires model → store → OpenClaw (the core pipeline)
Spec 4: /api/alerts + /api/config ← read endpoints for the dashboard
Spec 5: SSE Stream                ← real-time push to frontend
Spec 6: Dashboard Frontend        ← the UI that ties it all together
```

After Spec 3 is done, the **entire backend pipeline works end-to-end**: model POSTs metadata → Next.js stores alert → OpenClaw gets notified → channels fire. Everything after Spec 3 is the dashboard/monitoring layer.

---

## Spec 1 — Alert Store + Types

**Files:** `src/types/index.ts` (already done), `src/lib/alerts.ts`

**What to build:**
- In-memory `Map<string, Alert>` store
- `createAlert(payload)` — generate UUID, set status to `"detected"`, init timeline with `"fall_detected"` entry
- `getAlert(id)` — return single alert or null
- `listAlerts()` — return all alerts sorted by `createdAt` descending
- `updateAlertStatus(id, status)` — validate legal transition, append timeline entry
- `addTimelineEntry(id, entry)` — append arbitrary event to timeline
- Rate limiter: `Map<string, number>` tracking last alert timestamp per `cameraId`. Reject if within `cooldown_seconds` (default 10s)

**Test:**
- Import in a scratch route or test file
- Create, list, update, verify timeline entries
- Verify rate limiter blocks rapid duplicate alerts

**Done when:** You can create, list, and update alerts programmatically with validation.

---

## Spec 2 — OpenClaw Client

**Files:** `src/lib/openclaw.ts`

**What to build:**
- `notifyOpenClaw(message: string): Promise<void>`
- POST to `OPENCLAW_WEBHOOK_URL` with `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>`
- 5-second timeout via `AbortController`
- On failure: log error, do NOT throw (caller should not be blocked by OpenClaw being down)

**Test:**
- With OpenClaw running: trigger and verify it receives the webhook
- Without OpenClaw: verify the function logs an error and returns without throwing
- Verify timeout works (point at a non-responsive URL)

**Done when:** `notifyOpenClaw("test message")` either delivers or fails gracefully.

---

## Spec 3 — POST /api/fall-detected (The Core Pipeline)

**Files:** `src/app/api/fall-detected/route.ts`

**What to build:**
- Validate `X-Camera-Secret` header against `CAMERA_SECRET` env var → 401 if wrong
- Parse JSON body: `{ cameraId, cameraLabel, patientName, imagePath }`
- Validate `imagePath` starts with `/fall-images/` (prevent path traversal)
- Check rate limiter — if this `cameraId` fired within cooldown, return `429`
- Call `createAlert()` with the payload + location from active profile
- Construct image URL: `${BASE_URL}${imagePath}`
- Call `notifyOpenClaw()` with the structured message (fire-and-forget — don't await)
- Add `"openclaw_notified"` timeline entry
- Return `200 { ok: true }`

**Test:**
```bash
# Success
curl -X POST http://localhost:3000/api/fall-detected \
  -H "Content-Type: application/json" \
  -H "X-Camera-Secret: your-secret" \
  -d '{"cameraId":"cam-01","cameraLabel":"Living Room","patientName":"Taha","imagePath":"/fall-images/fall-123.jpg"}'
# → 200

# Bad secret
curl -X POST ... -H "X-Camera-Secret: wrong" -d '...'
# → 401

# Rate limited (send twice within 10s)
# → first 200, second 429

# Path traversal attempt
curl -X POST ... -d '{"imagePath":"/../../../etc/passwd",...}'
# → 400
```

**Done when:** The full pipeline fires — alert stored, OpenClaw notified, rate limiting works, bad requests rejected.

---

## Spec 4 — Read APIs (alerts + config)

**Files:** `src/app/api/alerts/route.ts`, `src/app/api/alerts/[id]/route.ts`, `src/app/api/config/route.ts`, `src/lib/profiles.ts`

**What to build:**
- `GET /api/alerts` — return `{ alerts: Alert[] }` from store. Optional `?status=` filter.
- `PATCH /api/alerts/:id` — accept `{ "status": "acknowledged" | "resolved" }`, validate transition, update store. Return updated alert or 404/400.
- `GET /api/config` — load active profile from `profiles/` directory based on `ACTIVE_PROFILE` env var. Implement `getActiveProfile()` in `profiles.ts`.

**Test:**
```bash
# Create an alert via /api/fall-detected first, then:
curl http://localhost:3000/api/alerts
# → list with one alert

curl -X PATCH http://localhost:3000/api/alerts/<id> \
  -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
# → updated alert

curl http://localhost:3000/api/config
# → hospital profile JSON
```

**Done when:** All read/write endpoints return correct data, status transitions validated, profile loads.

---

## Spec 5 — SSE Stream

**Files:** `src/lib/events.ts`, `src/app/api/alerts/stream/route.ts`

**What to build:**
- `alertEventBus` — Node `EventEmitter` singleton. Events: `"alert:created"`, `"alert:updated"`.
- Wire the alert store to emit events: after `createAlert()` → emit `"alert:created"`, after `updateAlertStatus()` → emit `"alert:updated"`.
- `GET /api/alerts/stream` — SSE endpoint. Returns `ReadableStream` with `Content-Type: text/event-stream`. Subscribes to event bus, writes `data: {JSON}\n\n` on each event. Cleans up on disconnect.

**Test:**
```bash
# Terminal 1 — listen
curl -N http://localhost:3000/api/alerts/stream

# Terminal 2 — trigger
curl -X POST http://localhost:3000/api/fall-detected -H "X-Camera-Secret: ..." -d '...'
# → Terminal 1 should show the new alert as an SSE event
```

**Done when:** SSE streams alert events in real time, cleans up on disconnect.

---

## Spec 6 — Dashboard Frontend

**Files:** All `src/components/*.tsx`, `src/app/page.tsx`, `src/app/alerts/[id]/page.tsx`

**What to build:**

Phase A — Alert Feed (home page):
- `StatusBar.tsx` — shows active profile name, last alert timestamp
- `AlertFeed.tsx` — fetches `GET /api/alerts` on mount, subscribes to SSE for live updates. Renders alert cards with: status badge (color-coded), camera label, patient name, timestamp, link to detail.
- `page.tsx` — composes StatusBar + AlertFeed

Phase B — Alert Detail:
- `AlertDetail.tsx` — shows fall image (`<img src={imagePath} />`), timeline (vertical list of events), status badge
- `AckButton.tsx` — "Acknowledge" / "Resolve" button, calls `PATCH /api/alerts/:id`
- `alerts/[id]/page.tsx` — fetches alert, renders AlertDetail + AckButton

Phase C — Polish:
- Mobile responsive layout (Tailwind `sm:`/`md:` breakpoints)
- Status badge colors: detected=red, escalated=orange, acknowledged=blue, resolved=green
- New alerts animate into the feed

**Test:**
1. Open `localhost:3000` → see empty feed with status bar
2. Trigger a fall via curl → alert card appears in real time
3. Click into detail → see fall image + timeline
4. Click Acknowledge → status updates, button changes to Resolve
5. Open on phone browser → verify mobile layout

**Done when:** Full dashboard works end-to-end with live updates.

---

## Summary

| Spec | Est. size | Depends on | Milestone |
|------|-----------|------------|-----------|
| 1. Alert Store | Small | — | Data layer works |
| 2. OpenClaw Client | Small | — | Can notify OpenClaw |
| 3. /api/fall-detected | Medium | 1, 2 | **Backend pipeline complete** |
| 4. Read APIs | Small | 1 | Dashboard has data to show |
| 5. SSE Stream | Small | 1 | Dashboard gets live updates |
| 6. Dashboard Frontend | Large | 4, 5 | **Everything works** |

Specs 1 and 2 can be built in parallel. After Spec 3, the core pipeline is live. Specs 4 and 5 can be built in parallel. Spec 6 is the final push.
