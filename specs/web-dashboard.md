# Spec: Dashboard (Frontend)

The Next.js frontend — alert feed, alert detail, live pose overlay, and status bar. This is what judges see.

---

## Phases

### Phase 1 — Layout + Alert Feed (Home Page)
- `web/src/app/layout.tsx` — base layout with app title ("FallGuard"), current profile badge, and nav.
- `web/src/app/page.tsx` — home page with two panels:
  - **Left/top**: Live pose overlay (placeholder in this phase — just a grey box with "Connecting to camera...").
  - **Right/bottom**: Alert feed.
- `web/src/components/AlertFeed.tsx`:
  - Connects to SSE endpoint (`/api/alerts/stream`) on mount.
  - Also fetches `GET /api/alerts` on mount for initial state.
  - Renders a list of alert cards, each showing: status badge (color-coded), location, timestamp, confidence, and a "View" link.
  - New alerts animate in at the top.
- `web/src/components/StatusBar.tsx`:
  - Shows: active deployment profile name, camera connection status (green/red dot), last alert timestamp.

### Phase 2 — Alert Detail Page
- `web/src/app/alerts/[id]/page.tsx`:
  - Fetches `GET /api/alerts/:id` (add this to the API if not already — or derive from the list).
  - Renders `AlertDetail.tsx`.
- `web/src/components/AlertDetail.tsx`:
  - **Pose overlay snapshot**: renders the 33 landmarks from `poseLandmarks` on a canvas as a skeleton wireframe on a dark background. Connect the standard MediaPipe Pose connections (shoulders→elbows→wrists, hips→knees→ankles, etc.).
  - **Timeline**: vertical list of all timeline entries — each with timestamp, event type, and detail. Color-coded by event type (detection = red, notification = blue, acknowledgment = green).
  - **Actions**: `AckButton.tsx` — "Acknowledge" button (if status is `detected` or `escalated`) and "Resolve" button (if status is `acknowledged`). Calls `PATCH /api/alerts/:id`.

### Phase 3 — Live Pose Overlay
- `web/src/components/PoseOverlay.tsx`:
  - Connects to the Pi's WebSocket (`PI_WS_URL` from config/env).
  - Receives landmark data + classification per frame.
  - Renders skeleton on a `<canvas>` element — dark background, white/green skeleton lines when normal, red skeleton lines when fall detected.
  - Shows the current classification label in the corner ("Normal" / "Possible Fall" / "FALL DETECTED").
  - If WebSocket disconnects, show "Camera disconnected — reconnecting..." and retry every 3 seconds.

### Phase 4 — Mobile Responsiveness
- The dashboard must be usable on the Qualcomm phone's browser.
- Single-column layout on mobile: pose overlay on top (smaller), alert feed below.
- Alert detail page: full-width, scrollable.
- Ack/resolve buttons must be large enough to tap.
- Use Tailwind responsive classes (`sm:`, `md:`, `lg:`).

---

## Manual Testing

### Phase 1
1. Run `npm run dev`, open `http://localhost:3000` → verify layout renders with StatusBar and empty alert feed.
2. POST an alert via curl → verify the alert card appears in the feed in real-time (via SSE).
3. POST 3 alerts → verify they appear in reverse chronological order.

### Phase 2
4. Click "View" on an alert → verify it navigates to `/alerts/<id>` and shows detail page.
5. Verify the pose overlay canvas renders the skeleton from the alert's landmarks.
6. Verify the timeline shows all events in order.
7. Click "Acknowledge" → verify the status badge updates and the button changes to "Resolve".

### Phase 3
8. Start the Pi's WebSocket server (or a mock WS server sending fake landmark data).
9. Open the dashboard → verify the live pose overlay canvas shows a moving skeleton.
10. Kill the WS server → verify "Camera disconnected" message appears. Restart → verify it reconnects.

### Phase 4
11. Open the dashboard on the Qualcomm phone browser → verify single-column layout, no horizontal scrolling, buttons are tappable.

---

## Metadata

### Implements
- `web/src/app/layout.tsx` — base layout
- `web/src/app/page.tsx` — home page
- `web/src/app/alerts/[id]/page.tsx` — alert detail page
- `web/src/components/AlertFeed.tsx`
- `web/src/components/AlertDetail.tsx`
- `web/src/components/PoseOverlay.tsx`
- `web/src/components/StatusBar.tsx`
- `web/src/components/AckButton.tsx`

### Does NOT Implement
- OpenClaw chat UI (see `openclaw-chat-ui.md`)
- API routes or backend logic
- Deployment profile switching UI — just reads the active profile from `/api/config` and displays it
