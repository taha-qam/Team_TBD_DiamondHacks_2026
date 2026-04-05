# Spec: Deployment Profiles

JSON config files that make the system re-targetable to hospital, hospice, or home with zero code changes. Small spec, big demo impact.

---

## Phases

### Phase 1 — Profile JSON Files
- Create `web/profiles/hospital.json`, `web/profiles/hospice.json`, `web/profiles/home.json`.
- Each file follows this shape:
  ```json
  {
    "name": "hospital",
    "displayName": "Hospital — ER",
    "location": "ER Waiting Room",
    "contacts": {
      "primary": {
        "name": "Nurse Station",
        "whatsapp": "+1234567890"
      },
      "escalation": {
        "name": "Dr. Smith",
        "email": "dr.smith@hospital.org"
      }
    },
    "thresholds": {
      "escalation_timeout_seconds": 60,
      "fall_confirmation_seconds": 3
    }
  }
  ```
- Hospice: location = "Room 3 — Patient Bed", primary = on-duty caregiver, escalation = family member.
- Home: location = "Living Room", primary = family member, escalation = emergency contact.

### Phase 2 — Profile Loader
- Create `web/src/lib/profiles.ts`.
- `getActiveProfile(): Profile` — reads `ACTIVE_PROFILE` env var (default `"hospital"`), loads the matching JSON from `web/profiles/`, returns typed object.
- The escalation engine, notification senders, and dashboard all call this to get location labels, contacts, and thresholds.

---

## Manual Testing

1. Set `ACTIVE_PROFILE=hospital` in `.env`, hit `GET /api/config` → verify hospital profile returned.
2. Change to `ACTIVE_PROFILE=home`, restart server, hit `GET /api/config` → verify home profile returned.
3. Trigger an alert → verify the WhatsApp message uses the location and contact from the active profile.
4. During the demo: switch profiles and show the dashboard status bar updating to the new profile name and location.

---

## Metadata

### Implements
- `web/profiles/hospital.json`
- `web/profiles/hospice.json`
- `web/profiles/home.json`
- `web/src/lib/profiles.ts` — `getActiveProfile()`

### Does NOT Implement
- Runtime profile switching via UI — just reads from env var at startup
- Profile editor / admin UI — edit the JSON file directly
