# Fall Detection System — Full Architecture & Implementation Prompt (Rubik Device)

## Overview

Build a fall detection notification pipeline running entirely on a single Rubik device. The fall detection model, Next.js middleware, and OpenClaw agent all run locally. When a fall is detected, the model writes an image to disk, notifies Next.js with metadata, and Next.js triggers OpenClaw to analyze and notify family/nurses via configured messaging channels.

## Stack

- **Device**: Rubik (all components run here)
- **Camera + Model**: Fall detection model running on Rubik, writes images to shared disk
- **Middleware**: Next.js (`localhost:3000`)
- **AI Agent**: OpenClaw (`localhost:18789`)
- **Notification channels**: Configured in OpenClaw (Telegram, WhatsApp, Slack, Discord, etc.) — Next.js has no knowledge of which channel is used

---

## Architecture

```
Fall model detects fall
    ↓  writes image to /shared/fall-images/fall-<timestamp>.jpg
    ↓  POST http://localhost:3000/api/fall-detected (metadata only)
Next.js API Route
    ↓  constructs local image URL (no file saving needed)
    ↓  POST http://localhost:18789/hooks
OpenClaw
    ↓  fetches image from localhost:3000/fall-images/<filename>
    ↓  imageModel (Claude Sonnet) analyzes fall
    ↓  composes structured alert
Telegram / WhatsApp / Slack / any configured channel
    ↓  family + nurse notified
```

---

## Directory Structure

```
/app
  /api
    /fall-detected
      route.ts          ← POST handler (metadata only)
/public
  /fall-images          ← symlink or mount to /shared/fall-images (gitignored)
/lib
  openclaw.ts           ← helper to POST to OpenClaw webhook
.env.local
```

> The fall detection model writes images to `/shared/fall-images/` on the Rubik device. Next.js serves that directory as static files via `/public/fall-images/` — either by symlinking or by configuring the shared path directly.

---

## Environment Variables

Store in `.env.local` — never hardcode:

```
OPENCLAW_GATEWAY_TOKEN=97f773a2c30018b69617546875ac1448edc05905d42d8fd3
OPENCLAW_WEBHOOK_URL=http://localhost:18789/hooks
BASE_URL=http://localhost:3000
CAMERA_SECRET=<shared secret between fall model and Next.js>
```

---

## Step 1 — `/lib/openclaw.ts`

Reusable helper that POSTs to the OpenClaw webhook with a 5 second timeout:

```ts
export async function notifyOpenClaw(message: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(process.env.OPENCLAW_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`OpenClaw webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('OpenClaw webhook unreachable:', err);
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Step 2 — `/app/api/fall-detected/route.ts`

Receives metadata only — the image is already on disk written by the fall model:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { notifyOpenClaw } from '@/lib/openclaw';

export async function POST(req: NextRequest) {
  // Validate shared secret
  const secret = req.headers.get('x-camera-secret');
  if (secret !== process.env.CAMERA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    cameraId: string;
    cameraLabel: string;
    patientName: string;
    imagePath: string; // e.g. /fall-images/fall-1712345678.jpg
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cameraLabel, patientName, imagePath } = body;

  const imageUrl = `${process.env.BASE_URL}${imagePath}`;

  // Fire webhook to OpenClaw — channel-agnostic
  await notifyOpenClaw(
    `FALL ALERT — Captured by ${cameraLabel}. ` +
    `Patient: ${patientName} has fallen. ` +
    `Please fetch and analyze this image: ${imageUrl} ` +
    `Describe exactly what you see — the patient's position, any objects nearby, ` +
    `and your assessment of urgency. ` +
    `Then send an immediate alert to: family, nurse-on-duty.`
  );

  return NextResponse.json({ ok: true });
}
```

---

## Step 3 — Serving the Shared Image Directory

The fall model writes images to `/shared/fall-images/` on the Rubik device. Next.js needs to serve them as static files.

**Option A — Symlink (simplest):**
```bash
ln -s /shared/fall-images ./public/fall-images
```

**Option B — Configure Next.js to serve from an external path** via a custom server or `next.config.ts` rewrite if the symlink approach isn't viable on the Rubik OS.

Verify it works by checking:
```bash
curl http://localhost:3000/fall-images/fall-<timestamp>.jpg
```

---

## Step 4 — OpenClaw Agent Behavior

OpenClaw receives the webhook and automatically:

1. Fetches the image from `localhost:3000/fall-images/<filename>`
2. Passes it to the configured `imageModel` (Claude Sonnet) for vision analysis
3. Composes a human-readable alert, e.g.:

> *"⚠️ FALL ALERT — Living Room Camera 3: Taha has fallen near the dining table. The chair appears to have tipped sideways. Taha is on his side on the floor. Immediate assistance may be required."*

4. Delivers the alert to all configured recipients via whatever channels are set up in OpenClaw

---

## Step 5 — Notification Channel Design

Notification routing is handled entirely at the OpenClaw level. Next.js only fires a webhook with a structured message and recipient roles (`family`, `nurse-on-duty`). It has no knowledge of which channel delivers the message.

**To add or change a notification channel:**
- Configure the new channel in OpenClaw (WhatsApp, Slack, Discord, etc.)
- Update OpenClaw's contacts/routing to map `family` and `nurse-on-duty` to the correct recipients
- Zero changes to the Next.js codebase required

---

## Step 6 — Security & Cleanup

- **Gitignore** `/public/fall-images/` — never commit patient images:
```
/public/fall-images/
```
- **Validate** all incoming requests with `X-Camera-Secret` header
- **Rate limit** `/api/fall-detected` — implement a 10 second cooldown per `cameraId` to prevent alert flooding if the model misfires repeatedly. Use a simple in-memory map for this since everything runs on one device
- **Clean up** old images on a schedule — keep last 20 images maximum to avoid filling the Rubik device's disk. The fall model or a cron job should handle this
- **Never log** the full image path with patient name in production logs — only log `cameraId` and timestamp

---

## Notes for Claude Code

- Use **App Router** (`route.ts`), not Pages Router
- The API route does **not** write any files — the fall model already wrote the image to disk
- Validate that `imagePath` starts with `/fall-images/` to prevent path traversal attacks
- The `notifyOpenClaw` helper must have a **5 second timeout** — the API route should not hang if OpenClaw is restarting
- If OpenClaw is unreachable, **log the error but still return 200** to the fall model so it does not retry and flood the endpoint
- The rate limiter should be a simple module-level `Map<string, number>` storing last alert timestamp per `cameraId` — no Redis or external store needed since this is a single-device deployment
- `BASE_URL` should be `http://localhost:3000` — all components are on the same Rubik device
- Confirm the symlink at `./public/fall-images` resolves correctly on the Rubik OS before relying on it — if symlinks aren't supported, implement a custom static file route instead