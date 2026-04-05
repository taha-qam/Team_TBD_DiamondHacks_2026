# Spec: Escalation Engine

The autonomous state machine that drives the agentic behavior. When an alert is created, this engine manages the timed escalation flow — it's the brain behind "detect → notify → wait → escalate."

---

## Phases

### Phase 1 — State Machine Core
- Create `web/src/lib/escalation.ts`.
- `startEscalation(alertId): void` — called by the POST /api/alerts handler after an alert is created.
  - Immediately triggers Stage 1 (WhatsApp notification) by calling the Twilio sender.
  - Sets a timer (configurable via deployment profile, default 60s).
  - When the timer fires, checks if the alert is still in `"detected"` status.
    - If yes → transitions to `"escalated"`, triggers Stage 2 (email + dashboard critical).
    - If no (already acknowledged) → do nothing.
- `cancelEscalation(alertId): void` — called when an alert is acknowledged. Clears the pending timer.
- Use `setTimeout` for timers. Store active timer references in a `Map<string, NodeJS.Timeout>`.

### Phase 2 — Notification Dispatch
- Stage 1 (on `detected`):
  - Call `sendWhatsApp()` from `twilio.ts` with the alert details and active profile's primary contact.
  - Call `addTimelineEntry()` with `"whatsapp_sent"`.
- Stage 2 (on `escalated`):
  - Call `sendEmail()` from `email.ts` with the alert details and active profile's escalation contact.
  - Call `addTimelineEntry()` with `"escalated"` and `"email_sent"`.
  - Emit an SSE event so the dashboard updates in real-time.

### Phase 3 — Continuous Monitoring Hook
- `updateMonitoring(alertId, stillDown: boolean): void` — called when the Pi sends follow-up data about an ongoing alert.
  - If `stillDown` and alert is in `"detected"` or `"escalated"`, append a timeline entry: "Patient still down — X minutes since fall."
  - If `!stillDown` (person got back up), append "Patient appears to have recovered" and optionally auto-transition to `"resolved"`.
- This is a stretch feature — stub it out in Phase 1, implement if time allows.

---

## Manual Testing

1. Create an alert via POST → verify WhatsApp function is called immediately (or log output if Twilio isn't set up yet).
2. Wait 60 seconds without acknowledging → verify the alert transitions to `"escalated"` and email function is called.
3. Create an alert, then PATCH to `"acknowledged"` within 60 seconds → verify the escalation timer is cancelled and no email is sent.
4. Create two alerts back to back → verify each has its own independent escalation timer.

---

## Metadata

### Implements
- `web/src/lib/escalation.ts` — `startEscalation()`, `cancelEscalation()`, `updateMonitoring()` (stub)

### Does NOT Implement
- The actual WhatsApp or email sending (see `web-twilio-whatsapp.md`, `web-email.md`) — this module calls them but doesn't implement them
- SSE emission (see `web-sse.md`) — this module triggers events but the SSE transport is separate
- The Pi-side continuous monitoring — that's an edge concern
