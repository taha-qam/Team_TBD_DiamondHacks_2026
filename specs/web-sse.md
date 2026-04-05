# Spec: Server-Sent Events (Real-Time Dashboard Updates)

SSE endpoint that pushes alert events to the dashboard so it updates live without polling.

---

## Phases

### Phase 1 — SSE Endpoint + Event Emitter
- Create a simple event bus in `web/src/lib/events.ts`:
  - `alertEventBus` — an `EventEmitter` (Node built-in) that other modules can emit to.
  - Events: `"alert:created"`, `"alert:updated"` — payload is the full `Alert` object.
- Create `web/src/app/api/alerts/stream/route.ts`:
  - GET handler that returns a `ReadableStream` with `Content-Type: text/event-stream`.
  - On connection, subscribe to `alertEventBus`.
  - On each event, write `data: {JSON}\n\n` to the stream.
  - On client disconnect, unsubscribe.

### Phase 2 — Emit Events From Store
- In `alerts.ts`, after `createAlert()` → emit `"alert:created"` on the bus.
- In `alerts.ts`, after `updateAlertStatus()` and `addTimelineEntry()` → emit `"alert:updated"` on the bus.
- This means any status change, escalation, or acknowledgment automatically pushes to all connected dashboards.

---

## Manual Testing

1. Open `http://localhost:3000/api/alerts/stream` in a browser tab — it should hang open (streaming).
2. In another terminal, POST a new alert → verify the SSE tab shows a `data: {...}` line with the new alert.
3. PATCH the alert to acknowledged → verify another SSE event appears with the updated status.
4. Open two browser tabs on the SSE endpoint → verify both receive events (fan-out).
5. Close one tab → verify the other still works and no errors are logged.

---

## Metadata

### Implements
- `web/src/lib/events.ts` — `alertEventBus` (EventEmitter singleton)
- `web/src/app/api/alerts/stream/route.ts` — SSE GET endpoint

### Does NOT Implement
- The pose overlay live stream — that's a direct WebSocket from the Pi to the browser (see architecture doc)
- WebSocket server — SSE is one-directional and sufficient for alert updates
