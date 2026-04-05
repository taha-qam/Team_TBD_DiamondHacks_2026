# PLAN.md — FallGuard: Edge AI Fall Detection & Agentic Alert System

> A privacy-first, edge-deployed fall detection framework that runs on a Rubik Pi with a camera. When a fall is detected, an autonomous agent triages the event, alerts caregivers via WhatsApp, escalates through email and a web dashboard, and lets staff interact with the system conversationally through OpenClaw. Designed for hospitals, hospice care, and personal home use.

---

## 1. Functional Requirements

### FR-1: Live Camera Ingestion (Rubik Pi + Camera)
- Camera feed streams frames to the on-device detection pipeline on the Rubik Pi.
- Frames are processed locally — no cloud round-trip, no patient data stored or transmitted.
- Target: process at least 1 frame every 1-2 seconds. Does not need real-time video FPS.

### FR-2: Fall Detection via Pose Estimation
- Use MediaPipe Pose to extract 33 body landmarks per frame.
- Detect a fall by tracking:
  - **Sudden vertical drop**: key points (hips, shoulders) drop below a threshold relative to the frame height over a short time window.
  - **Horizontal body orientation**: torso angle relative to ground crosses near-horizontal.
  - **Prolonged immobility**: after a drop, landmarks remain static for N seconds (configurable, e.g., 5s) — distinguishes a fall from someone bending down.
- Classify each frame window as: **normal**, **possible fall** (single-frame trigger), or **confirmed fall** (sustained over time window).

### FR-3: Agentic Alert Pipeline (The Star Feature)
This is the core differentiator — not just detection, but an autonomous agent that acts on detections.

**Stage 1 — Immediate WhatsApp Alert (Qualcomm Phone)**
- On confirmed fall, the agent sends a WhatsApp message to the on-duty caregiver via Twilio WhatsApp sandbox.
- Message includes: location (e.g., "Room 3 — Patient Bed"), timestamp, severity assessment, and a link to the dashboard.
- Caregiver can reply "ACK" or "ON MY WAY" to acknowledge.

**Stage 2 — Escalation (if no acknowledgment)**
- If no acknowledgment within a configurable window (e.g., 60 seconds):
  - Send email to the next-level contact (doctor, family member, facility manager).
  - Push alert to **critical** status on the web dashboard.
  - Send a follow-up WhatsApp: "No response received. Escalating."

**Stage 3 — Continuous Monitoring**
- Agent continues to watch the camera feed after the alert.
- If the person is still on the ground, the agent updates the alert: "Patient still down — 3 minutes since fall, no staff response."
- If the person gets back up, the agent updates: "Patient appears to have recovered. Please verify."

**Stage 4 — OpenClaw Conversational Interface**
- Staff can open OpenClaw and ask questions about any alert:
  - "What happened?" → agent explains the detection with timeline and confidence.
  - "Is the patient still down?" → agent checks latest frame analysis.
  - "Who has been notified?" → agent lists notification history.
  - "Show me the event." → agent returns the annotated pose overlay from the detection moment.
- OpenClaw is the reactive side (you talk to the agent). WhatsApp is the proactive side (agent talks to you).

### FR-4: Web Dashboard (PC)
- Next.js app running on the PC.
- **Live feed panel**: shows the pose-estimation overlay from the camera in near real-time (wireframe skeleton on blank/blurred background — no raw video).
- **Alert feed**: chronological list of events with timestamp, location, severity, and current status (new / acknowledged / escalated / resolved).
- **Alert detail view**: pose overlay at time of detection, full timeline of agent actions (WhatsApp sent, escalated, resolved), and notification log.
- **Acknowledge / resolve actions**: staff can mark alerts as handled from the dashboard.

### FR-5: Email Notification
- Triggered by the escalation stage (not on initial detection — WhatsApp handles that).
- Email contains: location, timestamp, severity, how long since the fall, who was already notified, and a direct link to the dashboard alert.
- Use Nodemailer with Gmail SMTP or SendGrid free tier.

### FR-6: Configurable Deployment Profiles
- The system should be trivially re-targetable to different environments via a config file:
  - **Hospital**: camera label = "ER Waiting Room", alerts go to nurse station WhatsApp + doctor email.
  - **Hospice**: camera label = "Room 3 — Patient Bed", alerts go to on-duty caregiver + family member.
  - **Home**: camera label = "Living Room", alerts go to family member WhatsApp + emergency contact email.
- For the demo, show at least two profiles to prove the framework is general-purpose.

---

## 2. Non-Functional Requirements (Hackathon Context)

### NFR-1: Privacy by Design
- No raw images or video are ever stored or transmitted.
- Only pose landmark coordinates (33 x/y/z points) and derived metrics are used.
- The dashboard shows skeleton overlays on a blank background — never the actual camera frame.
- This is a headline feature, not a footnote. Call it out in the pitch.

### NFR-2: Edge-First / Offline Detection
- The Rubik Pi detection pipeline must work without internet.
- Detection and classification happen entirely on-device.
- Network is only needed for the notification pipeline (WhatsApp, email, dashboard) which runs on the PC.

### NFR-3: Demo Resilience
- If the camera disconnects or a frame fails processing, the system skips and retries — no crashes.
- Pre-record a backup fall video clip that can be fed to the pipeline via a `--source video.mp4` flag.
- Have a backup demo path that uses the pre-recorded video if live camera has issues.

### NFR-4: Setup Speed
- The entire system should start with 3 commands:
  1. `python detect.py` on the Rubik Pi
  2. `npm run dev` on the PC (starts backend + frontend)
  3. Done. WhatsApp and email are configured via `.env`.

### NFR-5: Latency
- End-to-end from fall occurring to WhatsApp message arriving: target < 15 seconds.
- Fall detection to dashboard update: target < 5 seconds.
- Soft targets — the demo needs to feel responsive, not hit a strict SLA.

---

## 3. Architecture

```
[Camera] --USB/CSI--> [Rubik Pi (Edge Device)]
                           |
                     MediaPipe Pose
                     + Fall Classifier
                           |
                     (if fall confirmed)
                           |
                     POST /api/alerts ---------> [PC: Next.js Backend]
                                                    |       |       |
                                              [Dashboard] [Email] [WhatsApp via Twilio]
                                                    |
                                              [OpenClaw Chat]
                                                    
                                              [Qualcomm Phone]
                                              (receives WhatsApp)
                                              (accesses dashboard)
```

### Component Breakdown

| Component | Runs On | Tech | Role |
|-----------|---------|------|------|
| Camera capture + pose detection | Rubik Pi | Python, OpenCV, MediaPipe Pose, Nexa SDK | Captures frames, extracts pose, classifies fall, POSTs alert |
| Backend API + agent logic | PC | Next.js API routes or Express | Receives alerts, runs escalation state machine, dispatches notifications |
| Frontend dashboard | PC | Next.js + React | Live feed overlay, alert feed, ack/resolve actions |
| WhatsApp notifications | PC → Twilio → Phone | Twilio WhatsApp Sandbox API | Proactive alerts to caregiver's phone |
| Email notifications | PC | Nodemailer / SendGrid | Escalation-stage notifications |
| OpenClaw assistant | PC | OpenClaw SDK | Conversational interface for staff to query the system |
| Qualcomm Phone | Phone | WhatsApp + mobile browser | Receives alerts, views dashboard on mobile |

---

## 4. Detection Logic Detail

### Fall Classification (MediaPipe Pose)

```
Frame → MediaPipe Pose → 33 landmarks (x, y, z, visibility)

Key landmarks used:
- LEFT_HIP (23), RIGHT_HIP (24)        → vertical position tracking
- LEFT_SHOULDER (11), RIGHT_SHOULDER (12) → torso angle
- NOSE (0)                               → head position

Metrics:
1. hip_height    = avg(hip_y) normalized to frame height
2. torso_angle   = angle between shoulder-midpoint → hip-midpoint vs vertical
3. velocity      = delta(hip_height) over last N frames
4. stillness     = std_dev(all landmarks) over last N frames

Rules:
- POSSIBLE_FALL: hip_height drops below threshold AND torso_angle > 60°
- CONFIRMED_FALL: POSSIBLE_FALL sustained for 3+ seconds AND stillness < threshold
- RECOVERED: after CONFIRMED_FALL, hip_height returns above threshold
```

This is simple, explainable, and easy to demo. No ML training required.

---

## 5. Agentic Escalation State Machine

```
              ┌─────────────┐
              │   NORMAL     │ ◄── person standing / moving normally
              └──────┬───────┘
                     │ fall detected
                     ▼
              ┌─────────────┐
              │  DETECTED    │ ── WhatsApp sent to caregiver
              └──────┬───────┘
                     │ 60s, no ACK
                     ▼
              ┌─────────────┐
              │  ESCALATED   │ ── Email sent, dashboard critical
              └──────┬───────┘
                     │ caregiver ACKs (any channel)
                     ▼
              ┌─────────────┐
              │ ACKNOWLEDGED │ ── logged, still monitoring
              └──────┬───────┘
                     │ staff marks resolved / person recovers
                     ▼
              ┌─────────────┐
              │  RESOLVED    │ ── archived in alert history
              └─────────────┘
```

At any state, OpenClaw can be queried for current status, event timeline, and notification history.

---

## 6. Task Breakdown (Build Order)

### Phase 1 — Prove the Detection (first few hours)
1. **Pi camera capture script**: capture frames with OpenCV, run MediaPipe Pose, draw skeleton overlay, display locally.
2. **Fall classifier function**: implement the hip_height + torso_angle + stillness logic. Test with a teammate falling on camera vs. standing/sitting/bending.
3. **Alert POST**: on confirmed fall, POST a JSON payload to a hardcoded URL on the PC.

### Phase 2 — Backend + Dashboard (next few hours)
4. **Next.js project setup**: init project on PC, create `POST /api/alerts` endpoint, store alerts in-memory (or SQLite).
5. **Escalation state machine**: implement the DETECTED → ESCALATED → ACKNOWLEDGED → RESOLVED flow with timers.
6. **Dashboard page**: render live alert feed with status badges, auto-refresh via polling or SSE.
7. **Alert detail view**: show pose overlay snapshot, event timeline, notification log.

### Phase 3 — Notifications + OpenClaw (next few hours)
8. **WhatsApp via Twilio**: set up sandbox, send message on DETECTED, send follow-up on ESCALATED. Handle inbound "ACK" reply.
9. **Email on escalation**: send email when state transitions to ESCALATED.
10. **OpenClaw integration**: embed chat in dashboard, feed it alert context, support "what happened?" / "is patient still down?" / "who was notified?" queries.

### Phase 4 — Polish & Demo Prep (final stretch)
11. **Deployment profiles**: add a config file with hospital/hospice/home presets. Show switching between them in the demo.
12. **Mobile view**: verify dashboard is usable on the Qualcomm phone's browser.
13. **Backup video**: record a fall simulation clip, add `--source` flag to detection script.
14. **Live feed on dashboard**: stream the pose overlay (not raw video) from Pi to dashboard via websocket or SSE.
15. **README + demo script**: document setup and write the demo walkthrough.

---

## 7. Stretch Goals (Only If Time Permits)

- **Facial asymmetry detection** as a second detection mode (shows the framework is extensible beyond falls).
- **Phone as secondary camera**: nurse takes a photo with the Qualcomm phone, uploads to the system for a second-opinion analysis.
- **Multi-camera support**: multiple Rubik Pis posting to the same backend, each with its own location label.
- **Alert analytics**: dashboard page showing fall frequency, response times, escalation rates over time.
- **Voice interaction with OpenClaw**: instead of typing, staff speaks to OpenClaw via the phone.

---

## 8. Demo Script

1. **Setup shot**: Show the Rubik Pi with camera pointed at a chair/bed area. Dashboard on the PC screen. Qualcomm phone on the table.
2. **Normal state**: Teammate sits in a chair. Dashboard shows green status, live skeleton overlay, no alerts.
3. **The fall**: Teammate slumps/falls out of the chair onto the ground.
4. **Detection**: Dashboard instantly shows skeleton going horizontal. Alert appears within seconds.
5. **WhatsApp buzzes**: The Qualcomm phone on the table lights up with a WhatsApp message — "FALL DETECTED — Room 3, Patient Bed. Tap to view. Reply ACK to acknowledge."
6. **Ignore it**: Nobody responds. 60 seconds pass. Phone buzzes again: "No response. Escalating to Dr. Smith."
7. **Email arrives**: Show the email notification on screen.
8. **Doctor uses OpenClaw**: Open the chat. Ask "What happened in Room 3?" → Agent responds with full context. Ask "Is the patient still down?" → Agent checks latest data and responds.
9. **Acknowledge**: Doctor clicks acknowledge on dashboard. Alert moves to acknowledged state.
10. **Switch profile**: Quickly swap to "Home" profile — show it reconfigured for "Living Room" with family member as the contact. Same system, different context.
11. **Pitch**: "This runs entirely on-device. No video leaves the room. The AI doesn't just detect — it acts. It triages, it notifies, it escalates, it answers questions. One Rubik Pi, one camera, and an agent that watches when humans can't."

---

## 9. Key Pitch Points for Judges

- **Edge AI**: Detection runs fully on-device. No cloud dependency for the critical path.
- **Privacy**: Zero raw images stored or transmitted. Only skeleton coordinates.
- **Agentic, not just analytical**: The system doesn't just detect and display — it autonomously acts through a multi-stage escalation pipeline.
- **Framework, not a one-off**: Configurable for hospital, hospice, or home with a single config change.
- **Real hardware**: Live demo on Qualcomm Rubik Pi + camera + phone. Not a simulation.
- **Human-in-the-loop**: The agent handles triage and escalation, but a human always makes the final call. OpenClaw lets them interact conversationally rather than staring at dashboards.
