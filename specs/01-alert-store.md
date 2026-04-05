# Spec 01 — Alert Store + Types

Data layer for alerts. Everything else depends on this.

---

## Files

- `web/src/types/index.ts` — already done
- `web/src/lib/alerts.ts` — implement here

---

## Phases

### Phase 1 — In-Memory Store + CRUD

Create an in-memory store using `Map<string, Alert>` and export the following functions:

**`createAlert(payload)`**
- Input:
  ```typescript
  {
    cameraId: string;
    cameraLabel: string;
    patientName: string;
    imagePath: string;
    location: string;
  }
  ```
- Generate a UUID (`crypto.randomUUID()`)
- Set `status` to `"detected"`
- Set `timestamp`, `createdAt`, `updatedAt` to current ISO 8601
- Initialize `timeline` with one entry:
  ```typescript
  { timestamp: now, event: "fall_detected", detail: `Detected by ${cameraLabel}` }
  ```
- Store in the Map, return the full `Alert` object

**`getAlert(id): Alert | null`**
- Return the alert or null if not found

**`listAlerts(): Alert[]`**
- Return all alerts as an array, sorted by `createdAt` descending (newest first)

**`updateAlertStatus(id, newStatus): Alert`**
- Validate the alert exists → throw `"Alert not found"` if missing
- Validate the transition is legal:
  - `detected` → `escalated` or `acknowledged`
  - `escalated` → `acknowledged`
  - `acknowledged` → `resolved`
  - Everything else → throw `"Invalid status transition"`
- Update `status` and `updatedAt`
- Append a timeline entry: `{ timestamp: now, event: newStatus }`
- Return the updated alert

**`addTimelineEntry(id, event, detail?): Alert`**
- Validate the alert exists
- Append `{ timestamp: now, event, detail }` to the timeline
- Update `updatedAt`
- Return the updated alert

### Phase 2 — Rate Limiter

Add a separate `Map<string, number>` tracking the last alert timestamp (ms) per `cameraId`.

**`checkRateLimit(cameraId, cooldownSeconds): boolean`**
- If `cameraId` has no entry, return `true` (allow)
- If `Date.now() - lastTimestamp >= cooldownSeconds * 1000`, return `true`
- Otherwise return `false` (block)

**`recordAlert(cameraId): void`**
- Set `cameraId` → `Date.now()` in the rate limit map

Call `checkRateLimit` before `createAlert` in the API route (not inside `createAlert` itself — keep the store logic pure). Call `recordAlert` after a successful create.

---

## Manual Testing

Create a temporary test route at `web/src/app/api/test-store/route.ts` (delete after testing):

```typescript
import { createAlert, listAlerts, getAlert, updateAlertStatus, addTimelineEntry, checkRateLimit, recordAlert } from "@/lib/alerts";
import { NextResponse } from "next/server";

export async function GET() {
  // 1. Create an alert
  const alert = createAlert({
    cameraId: "cam-01",
    cameraLabel: "Living Room Camera",
    patientName: "Taha",
    imagePath: "/fall-images/fall-123.jpg",
    location: "Living Room",
  });

  // 2. Verify it exists
  const fetched = getAlert(alert.id);

  // 3. List all
  const all = listAlerts();

  // 4. Update status
  const acked = updateAlertStatus(alert.id, "acknowledged");

  // 5. Add timeline entry
  const updated = addTimelineEntry(alert.id, "openclaw_notified", "Webhook sent");

  // 6. Illegal transition — should throw
  let error = null;
  try {
    updateAlertStatus(alert.id, "detected");
  } catch (e: any) {
    error = e.message;
  }

  // 7. Rate limiter
  const firstCheck = checkRateLimit("cam-01", 10);  // true
  recordAlert("cam-01");
  const secondCheck = checkRateLimit("cam-01", 10); // false

  return NextResponse.json({
    created: alert,
    fetched: fetched?.id === alert.id,
    listCount: all.length,
    ackedStatus: acked.status,
    timelineCount: updated.timeline.length,
    illegalTransitionError: error,
    rateLimiter: { firstCheck, secondCheck },
  });
}
```

Hit `curl http://localhost:3000/api/test-store` and verify:
- `created` has UUID, status `"detected"`, one timeline entry
- `fetched` is `true`
- `listCount` is `1`
- `ackedStatus` is `"acknowledged"`
- `timelineCount` is `3` (fall_detected + acknowledged + openclaw_notified)
- `illegalTransitionError` is `"Invalid status transition"`
- `rateLimiter.firstCheck` is `true`, `secondCheck` is `false`

Delete `api/test-store/route.ts` when done.

---

## Metadata

### Implements
- `web/src/lib/alerts.ts` — `createAlert`, `getAlert`, `listAlerts`, `updateAlertStatus`, `addTimelineEntry`, `checkRateLimit`, `recordAlert`

### Does NOT Implement
- API routes (Spec 03, 04)
- SSE event emission (Spec 05 — will wire into the store later)
- Persistence / database — in-memory only
