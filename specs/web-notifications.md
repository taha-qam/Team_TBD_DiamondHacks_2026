# Spec: Notifications (WhatsApp + Email)

Both outbound notification channels in one spec — they share the same trigger points and follow the same pattern: receive alert data, format a message, send it, log it.

---

## Phases

### Phase 1 — Twilio WhatsApp Setup + Sender
- Create `web/src/lib/twilio.ts`.
- `sendWhatsApp(alert: Alert, contact: Contact): Promise<void>`
  - Uses the Twilio Node SDK (`twilio` npm package).
  - Sends a message from the sandbox number (`TWILIO_WHATSAPP_FROM`) to the contact's WhatsApp number.
  - Message template:
    ```
    ⚠️ FALL DETECTED
    📍 {location}
    🕐 {timestamp}
    Confidence: {confidence}%
    
    View details: {dashboard_url}/alerts/{id}
    Reply ACK to acknowledge.
    ```
  - On Twilio API error, log the error but don't throw — the escalation engine should continue regardless.

### Phase 2 — Twilio Inbound Webhook (ACK replies)
- Create `web/src/app/api/webhooks/twilio/route.ts`.
- Twilio POSTs here when the nurse replies to the WhatsApp message.
- Parse the inbound message body. If it contains "ACK" (case-insensitive):
  - Find the most recent alert in `"detected"` or `"escalated"` status.
  - Call `updateAlertStatus(id, "acknowledged")`.
  - Call `cancelEscalation(id)`.
  - Reply with: "Acknowledged. Alert marked as handled."
- If the message doesn't match, reply with: "Reply ACK to acknowledge the latest alert."

### Phase 3 — Email Sender
- Create `web/src/lib/email.ts`.
- `sendEmail(alert: Alert, contact: Contact): Promise<void>`
  - Uses `nodemailer` with Gmail SMTP (credentials from env vars).
  - Email content:
    - Subject: `ESCALATED: Fall detected at {location}`
    - Body (HTML): location, timestamp, confidence, time since detection, who was already notified (from timeline), link to dashboard alert detail.
  - On SMTP error, log but don't throw.

### Phase 4 — Escalation Follow-Up WhatsApp
- When the escalation engine transitions an alert to `"escalated"`:
  - Send a second WhatsApp to the primary contact: "No response received for fall at {location}. Escalating to {escalation_contact_name}."
  - This is called by the escalation engine, not triggered independently.

---

## Manual Testing

### WhatsApp
1. Set up Twilio sandbox: follow sandbox setup instructions, register your phone number.
2. Trigger a POST to `/api/alerts` → verify your phone receives a WhatsApp message within seconds.
3. Reply "ACK" → verify the webhook fires, alert status changes to `"acknowledged"`, and you receive a confirmation reply.
4. Reply "hello" → verify you get the "Reply ACK..." fallback message.

### Email
1. Set up a Gmail app password and configure `.env`.
2. Trigger an alert and let it escalate (wait 60s without ACK) → verify the escalation email arrives.
3. Check the email content — verify it includes location, timestamp, confidence, and dashboard link.

### Without Credentials (Dev Mode)
- If `TWILIO_ACCOUNT_SID` is not set, `sendWhatsApp` should log the message to console instead of calling Twilio. Same for `sendEmail` if `EMAIL_HOST` is not set. This lets the rest of the team develop without needing credentials.

---

## Metadata

### Implements
- `web/src/lib/twilio.ts` — `sendWhatsApp()`
- `web/src/lib/email.ts` — `sendEmail()`
- `web/src/app/api/webhooks/twilio/route.ts` — inbound WhatsApp reply handler

### Does NOT Implement
- Escalation timing/logic (see `web-escalation-engine.md`) — this module is called by the engine
- SMS or other channels — WhatsApp and email only
- Message history / delivery tracking — fire and forget
