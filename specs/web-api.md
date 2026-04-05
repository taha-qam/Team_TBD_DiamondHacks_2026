# Spec: API Routes

REST endpoints that the Pi, dashboard, and OpenClaw all hit. Thin layer — receives requests, delegates to the alert store and escalation engine, returns JSON.

---

## Phases

### Phase 1 — POST /api/alerts (receive alert from Pi)
- Create `web/src/app/api/alerts/route.ts`.
- Accepts JSON body matching the Pi alert payload:
  ```json
  {
    "timestamp": "2026-04-05T14:32:01Z",
    "confidence": 0.87,
    "poseLandmarks": [...],
    "metrics": { "hip_height": 0.15, "torso_angle": 72.3, "stillness": 0.02 }
  }
  ```
- Calls `createAlert()` from the alert store.
- Kicks off the escalation engine for this alert (fire-and-forget, don't block the response).
- Returns `201` with the created `Alert` object.
- Returns `400` with error message if validation fails.

### Phase 2 — GET /api/alerts (list alerts)
- Same `route.ts` file, GET handler.
- Returns `200` with `{ alerts: Alert[] }` sorted by most recent first.
- Optional query param `?status=detected` to filter by status.

### Phase 3 — PATCH /api/alerts/:id (acknowledge / resolve)
- Create `web/src/app/api/alerts/[id]/route.ts`.
- Accepts JSON body: `{ "status": "acknowledged" | "resolved" }`.
- Calls `updateAlertStatus()` from the alert store.
- If transitioning to `"acknowledged"`, cancels any pending escalation timer for this alert.
- Returns `200` with the updated `Alert`.
- Returns `404` if alert ID not found, `400` if illegal transition.

### Phase 4 — GET /api/config (deployment profile)
- Create `web/src/app/api/config/route.ts`.
- Reads the active profile from `ACTIVE_PROFILE` env var.
- Loads the corresponding JSON file from `web/profiles/`.
- Returns `200` with the profile object.

---

## Manual Testing

1. `curl -X POST http://localhost:3000/api/alerts -H "Content-Type: application/json" -d '{"timestamp":"...","confidence":0.85,"poseLandmarks":[...],"metrics":{...}}'` → verify 201 + alert object returned.
2. `curl http://localhost:3000/api/alerts` → verify the alert appears in the list.
3. `curl -X PATCH http://localhost:3000/api/alerts/<id> -H "Content-Type: application/json" -d '{"status":"acknowledged"}'` → verify status updated, timeline entry added.
4. `curl -X PATCH http://localhost:3000/api/alerts/<id> -d '{"status":"detected"}'` → verify 400 (illegal transition).
5. `curl http://localhost:3000/api/config` → verify it returns the active deployment profile JSON.

---

## Metadata

### Implements
- `web/src/app/api/alerts/route.ts` — POST + GET handlers
- `web/src/app/api/alerts/[id]/route.ts` — PATCH handler
- `web/src/app/api/config/route.ts` — GET handler

### Does NOT Implement
- SSE streaming endpoint (see `web-sse.md`)
- Twilio webhook endpoint (see `web-twilio-whatsapp.md`)
- Request authentication — out of scope for hackathon
