# Spec 02 — OpenClaw Client

Reusable helper that POSTs to the OpenClaw webhook. Fire-and-forget — never blocks the caller.

---

## Files

- `web/src/lib/openclaw.ts` — implement here

---

## Setup Notes (What We Learned)

### OpenClaw Config (`openclaw.json` on Rubik)

We had to enable **external webhooks** in the `hooks` section of the OpenClaw config. By default, only internal hooks (session-memory, boot-md, etc.) are enabled. The key changes:

1. **Added `enabled: true`** at the top level of `hooks` (not just inside `internal`).
2. **Set a dedicated `token`** — this MUST be different from the **gateway auth token**. OpenClaw enforces this and will refuse to start if they match. The gateway token (`97f773a2...`) is for authenticating with the OpenClaw dashboard/API. The hooks token (`fallguard-hooks-token-2026`) is specifically for webhook ingress.
3. **Set `path: "/hooks"`** — this makes the webhook endpoints available at `localhost:18789/hooks/*`.

No `mappings` array was needed — the built-in `/hooks/agent` endpoint works out of the box once hooks are enabled. Routing to the correct channel is handled via `channel` and `to` fields in the webhook payload itself.

```json
"hooks": {
    "internal": { ... },
    "enabled": true,
    "token": "fallguard-hooks-token-2026",
    "path": "/hooks"
}
```

### Telegram Chat ID

To get the Telegram chat ID, we used `openclaw doctor` on the Rubik which surfaced the chat ID for the connected Telegram bot. This ID (`8717301180`) is passed in the webhook payload via the `to` field so OpenClaw knows which Telegram chat to deliver the alert to.

### Webhook Payload

The `notifyOpenClaw` helper sends a structured payload to `/hooks/agent`:
- `message` — the alert text
- `name` — agent run label (`"FallAlert"`)
- `deliver: true` — tells OpenClaw to send the response to a channel
- `channel: "telegram"` — which channel to deliver to
- `to` — the Telegram chat ID (from `TELEGRAM_CHAT_ID` env var)

Without `channel` and `to`, OpenClaw runs the agent but doesn't deliver anywhere.

### Prompt Injection Gotcha

OpenClaw's agent flagged our initial test message as a prompt injection because it contained instructions like "fetch this URL" and "send an alert to these people." The fix: frame messages as simple alert descriptions, not as instructions for the agent to execute.

---

## Phases

### Phase 1 — notifyOpenClaw Function

**`notifyOpenClaw(message: string): Promise<void>`**

```
POST ${OPENCLAW_WEBHOOK_URL}
Headers:
  Content-Type: application/json
  Authorization: Bearer ${OPENCLAW_WEBHOOK_TOKEN}
Body:
  {
    "message": "<message>",
    "name": "FallAlert",
    "deliver": true,
    "channel": "telegram",
    "to": "${TELEGRAM_CHAT_ID}"
  }
Timeout: 5 seconds
```

Implementation details:
- Read `OPENCLAW_WEBHOOK_URL`, `OPENCLAW_WEBHOOK_TOKEN`, and `TELEGRAM_CHAT_ID` from `process.env`
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

## Environment Variables

```env
# The gateway auth token — for OpenClaw dashboard/API access
OPENCLAW_GATEWAY_TOKEN=

# The hooks token — MUST be different from gateway token, used for webhook auth
OPENCLAW_WEBHOOK_TOKEN=

# Webhook endpoint
OPENCLAW_WEBHOOK_URL=http://localhost:18789/hooks/agent

# Telegram chat ID — retrieved via `openclaw doctor` on the Rubik
TELEGRAM_CHAT_ID=
```

---

## Manual Testing

> **Note:** Development and testing runs on your local machine (PC), not on the Rubik device. OpenClaw runs on the Rubik at `localhost:18789`, so the webhook will fail gracefully during local dev unless you're on the same network and point `OPENCLAW_WEBHOOK_URL` to the Rubik's IP (e.g., `http://<RUBIK_IP>:18789/hooks/agent`). Use the "Without OpenClaw" and "Timeout" tests below for local development.

### With OpenClaw running (on Rubik or same machine)

1. Ensure OpenClaw is running (either locally or on the Rubik device)
2. Set `OPENCLAW_WEBHOOK_URL` in `.env.local`:
   - Same machine: `http://localhost:18789/hooks/agent`
   - Rubik over network: `http://<RUBIK_IP>:18789/hooks/agent`
3. Set `OPENCLAW_WEBHOOK_TOKEN` and `TELEGRAM_CHAT_ID` in `.env.local`
4. Test route is at `web/src/app/api/test-openclaw/route.ts`
5. `curl http://localhost:3000/api/test-openclaw` → verify OpenClaw received the webhook and a Telegram message was delivered

### Without OpenClaw

1. Unset `OPENCLAW_WEBHOOK_URL` in `.env.local` (or leave it empty)
2. `curl http://localhost:3000/api/test-openclaw` → verify:
   - Returns `{ ok: true }` (does not error)
   - Console shows `[OpenClaw dev mode] Would send: ...`

### Timeout test

1. Set `OPENCLAW_WEBHOOK_URL` to a non-responsive URL (e.g., `http://localhost:9999/hooks/agent`)
2. `curl http://localhost:3000/api/test-openclaw` → verify:
   - Returns `{ ok: true }` after ~5 seconds (does not hang forever)
   - Console shows an error log about the failed connection

### Bash test script

Run `./test-endpoints.sh` from the `web/` directory (start `npm run dev` first).

Delete `api/test-openclaw/route.ts` when done.

---

## Metadata

### Implements
- `web/src/lib/openclaw.ts` — `notifyOpenClaw(message)`

### Does NOT Implement
- OpenClaw agent configuration (channels, contacts, routing) — that's in `openclaw.json` on the Rubik
- The structured alert message template — that's composed by the `/api/fall-detected` route (Spec 03)
- Image analysis — that's Claude Sonnet via OpenClaw, not our code
