# Spec 02 — OpenClaw Client

Reusable helper that POSTs to the OpenClaw webhook. Fire-and-forget — never blocks the caller.

---

## Files

- `web/src/lib/openclaw.ts` — implement here

---

## Phases

### Phase 1 — notifyOpenClaw Function

**`notifyOpenClaw(message: string): Promise<void>`**

```
POST ${OPENCLAW_WEBHOOK_URL}
Headers:
  Content-Type: application/json
  Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}
Body:
  { "message": "<message>" }
Timeout: 5 seconds
```

Implementation details:
- Read `OPENCLAW_WEBHOOK_URL` and `OPENCLAW_GATEWAY_TOKEN` from `process.env`
- Create an `AbortController`, set a 5-second timeout via `setTimeout(() => controller.abort(), 5000)`
- `fetch()` with the abort signal
- If response is not ok: `console.error` the status and statusText
- If fetch throws (network error, timeout abort): `console.error` the error
- **Always clear the timeout in a `finally` block**
- **Never throw** — the caller should not be blocked if OpenClaw is down

### Phase 2 — Dev Mode Fallback

If `OPENCLAW_WEBHOOK_URL` is not set (empty or undefined):
- Log the message to console: `console.log("[OpenClaw dev mode] Would send:", message)`
- Return immediately without making any HTTP request
- This lets the rest of the team develop and test without OpenClaw running

---

## Manual Testing

> **Note:** Development and testing runs on your local machine (PC), not on the Rubik device. OpenClaw runs on the Rubik at `localhost:18789`, so the webhook will fail gracefully during local dev unless you're on the same network and point `OPENCLAW_WEBHOOK_URL` to the Rubik's IP (e.g., `http://<RUBIK_IP>:18789/hooks`). Use the "Without OpenClaw" and "Timeout" tests below for local development.

### With OpenClaw running (on Rubik or same machine)

1. Ensure OpenClaw is running (either locally or on the Rubik device)
2. Set `OPENCLAW_WEBHOOK_URL` in `.env.local`:
   - Same machine: `http://localhost:18789/hooks`
   - Rubik over network: `http://<RUBIK_IP>:18789/hooks`
3. Set `OPENCLAW_GATEWAY_TOKEN` in `.env.local`
4. Create a temporary test route at `web/src/app/api/test-openclaw/route.ts`:

```typescript
import { notifyOpenClaw } from "@/lib/openclaw";
import { NextResponse } from "next/server";

export async function GET() {
  await notifyOpenClaw(
    "TEST ALERT — This is a test message from FallGuard. " +
    "Please fetch and analyze this image: http://localhost:3000/fall-images/test.jpg " +
    "Describe what you see and send an alert to: family, nurse-on-duty."
  );
  return NextResponse.json({ ok: true, note: "Check OpenClaw logs for delivery" });
}
```

4. `curl http://localhost:3000/api/test-openclaw` → verify OpenClaw received the webhook (check its logs or configured channel)

### Without OpenClaw

1. Unset `OPENCLAW_WEBHOOK_URL` in `.env.local` (or leave it empty)
2. `curl http://localhost:3000/api/test-openclaw` → verify:
   - Returns `{ ok: true }` (does not error)
   - Console shows `[OpenClaw dev mode] Would send: TEST ALERT — ...`

### Timeout test

1. Set `OPENCLAW_WEBHOOK_URL` to a non-responsive URL (e.g., `http://localhost:9999/hooks`)
2. `curl http://localhost:3000/api/test-openclaw` → verify:
   - Returns `{ ok: true }` after ~5 seconds (does not hang forever)
   - Console shows an error log about the failed connection

Delete `api/test-openclaw/route.ts` when done.

---

## Metadata

### Implements
- `web/src/lib/openclaw.ts` — `notifyOpenClaw(message)`

### Does NOT Implement
- OpenClaw agent configuration (channels, contacts, routing) — that's OpenClaw's own config
- The structured message template — that's composed by the `/api/fall-detected` route (Spec 03)
- Image analysis — that's Claude Sonnet via OpenClaw, not our code
