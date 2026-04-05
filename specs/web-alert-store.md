# Spec: Alert Store

In-memory alert storage and CRUD operations. This is the data layer that every other web component depends on — build it first.

---

## Phases

### Phase 1 — Data Model + In-Memory Store
- Define the `Alert`, `PoseLandmark`, `TimelineEntry`, and `AlertStatus` types in `web/src/types/index.ts`.
- Create `web/src/lib/alerts.ts` with an in-memory `Map<string, Alert>` and the following functions:
  - `createAlert(payload): Alert` — generates UUID, sets status to `"detected"`, initializes timeline with a `"fall_detected"` entry, sets `createdAt`/`updatedAt`.
  - `getAlert(id): Alert | null`
  - `listAlerts(): Alert[]` — returns all alerts sorted by `createdAt` descending.
  - `updateAlertStatus(id, status): Alert` — transitions status, appends a timeline entry, updates `updatedAt`.
  - `addTimelineEntry(id, entry): Alert` — appends an arbitrary timeline event (used by escalation engine, notification senders).

### Phase 2 — Validation
- `createAlert` validates the incoming payload: `timestamp` must be ISO 8601, `confidence` must be 0-1, `poseLandmarks` must be an array of 33 items. Throw descriptive errors on invalid input.
- `updateAlertStatus` validates that the transition is legal (e.g., can't go from `"resolved"` back to `"detected"`).

---

## Manual Testing

1. Import `alerts.ts` in a scratch script or Next.js API route.
2. Call `createAlert` with a valid payload → verify returned alert has UUID, status `"detected"`, and one timeline entry.
3. Call `createAlert` with missing fields → verify it throws.
4. Call `listAlerts` → verify it returns alerts in reverse chronological order.
5. Call `updateAlertStatus(id, "escalated")` → verify status changed and timeline has a new entry.
6. Call `updateAlertStatus(id, "detected")` on an already-escalated alert → verify it throws (illegal transition).

---

## Metadata

### Implements
- `web/src/types/index.ts` — `Alert`, `AlertStatus`, `PoseLandmark`, `TimelineEntry` types
- `web/src/lib/alerts.ts` — in-memory store + CRUD functions

### Does NOT Implement
- API routes (see `web-api.md`)
- Escalation timer logic (see `web-escalation-engine.md`)
- Database/SQLite persistence — out of scope for hackathon
