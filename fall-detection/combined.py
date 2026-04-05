"""
main.py — single entry point for the Pi.

Opens the camera ONCE, then fans frames out to:
  1. Fall detector  (runs in the main thread via MediaPipe)
  2. MJPEG server   (Flask, background thread, serves /mjpeg on port 8000)

Usage:
    python3 main.py
    python3 main.py --source 0 --port 8000 --nextjs-url http://192.168.1.55:3000
    python3 main.py --no-gui          # headless / SSH
"""

import argparse
import base64
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

import cv2
import numpy as np
import requests
from flask import Flask, Response
from mediapipe.python.solutions import drawing_utils as mp_draw
from mediapipe.python.solutions import pose as mp_pose_module

from fall_detector import FallDetector, FallState
from features import (
    compute_landmark_velocity,
    compute_torso_angle,
    compute_vertical_position,
    get_keypoints,
)

# ---------------------------------------------------------------------------
# Shared frame buffer — written by capture thread, read by MJPEG server
# ---------------------------------------------------------------------------
_raw_lock = threading.Lock()
_raw_frame: Optional[np.ndarray] = None   # latest BGR frame, unmodified

# Annotated frame (with skeleton + HUD) for optional local GUI
_ann_lock = threading.Lock()
_ann_frame: Optional[np.ndarray] = None

# ---------------------------------------------------------------------------
# MJPEG server (Flask)
# ---------------------------------------------------------------------------
MJPEG_TARGET_W = 640
MJPEG_TARGET_H = 360
MJPEG_FPS = 10
MJPEG_QUALITY = 55

flask_app = Flask(__name__)

def _mjpeg_generator():
    frame_delay = 1.0 / MJPEG_FPS
    last_sent = 0.0
    while True:
        now = time.time()
        if now - last_sent < frame_delay:
            time.sleep(0.01)
            continue

        with _raw_lock:
            frame = _raw_frame
        if frame is None:
            time.sleep(0.05)
            continue

        small = cv2.resize(frame, (MJPEG_TARGET_W, MJPEG_TARGET_H), interpolation=cv2.INTER_AREA)
        ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, MJPEG_QUALITY])
        if not ok:
            continue

        last_sent = now
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + jpg.tobytes() + b"\r\n"
        )

@flask_app.get("/mjpeg")
def mjpeg():
    return Response(
        _mjpeg_generator(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Access-Control-Allow-Origin": "*"},
    )

@flask_app.get("/health")
def health():
    return {"ok": True}

def _start_flask(port: int):
    import logging
    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)   # silence per-request logs
    flask_app.run(host="0.0.0.0", port=port, threaded=True)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
STATE_COLORS = {
    FallState.NORMAL:         (0, 200, 0),
    FallState.POSSIBLE_FALL:  (0, 165, 255),
    FallState.CONFIRMED_FALL: (0, 0, 255),
}

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _build_payload(
    patient: Dict[str, Any],
    monitoring: Dict[str, Any],
    image_b64: Optional[str],
) -> Dict[str, Any]:
    return {
        "timestamp": _iso_now(),
        "patient": patient,
        "monitoring": monitoring,
        "image": image_b64,
    }

def _draw_hud(frame, state, debug, w, h):
    color = STATE_COLORS.get(state, (255, 255, 255))
    label = state.value.upper().replace("_", " ")

    cv2.rectangle(frame, (0, 0), (w, 40), (0, 0, 0), -1)
    cv2.putText(frame, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)

    y = 70
    for key, val in debug.items():
        if key == "state":
            continue
        text = f"{key}: {val:.3f}" if isinstance(val, float) else f"{key}: {val}"
        cv2.putText(frame, text, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        y += 20

    if state == FallState.CONFIRMED_FALL:
        cv2.rectangle(frame, (0, h - 50), (w, h), (0, 0, 180), -1)
        cv2.putText(frame, "FALL DETECTED - ALERT TRIGGERED",
                    (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

# ---------------------------------------------------------------------------
# Main run loop
# ---------------------------------------------------------------------------
def run(
    source: int = 0,
    flask_port: int = 8000,
    immobility_confirm_seconds: float = 5.0,
    fps_override: Optional[float] = None,
    patient: Optional[Dict[str, Any]] = None,
    monitoring: Optional[Dict[str, Any]] = None,
    on_fall: Optional[Callable[[Dict[str, Any]], None]] = None,
    show_gui: bool = False,
):
    global _raw_frame, _ann_frame

    patient   = patient   or {"id": "patient-001", "name": "Evelyn Carter"}
    monitoring = monitoring or {"location": "living room", "cameraNumber": 1}

    # --- Open camera (once) ---
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"ERROR: Cannot open camera source {source!r}")
        sys.exit(1)

    fps = fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0
    print(f"Camera opened  (source={source}, fps={fps:.0f})")

    # --- Start Flask in background thread ---
    flask_thread = threading.Thread(
        target=_start_flask, args=(flask_port,), daemon=True
    )
    flask_thread.start()
    print(f"MJPEG stream   → http://0.0.0.0:{flask_port}/mjpeg")

    # --- Fall detector ---
    detector = FallDetector(
        immobility_confirm_seconds=immobility_confirm_seconds,
        fps=fps,
    )
    last_state = FallState.NORMAL
    prev_pts = None
    start_time = time.time()

    with mp_pose_module.Pose(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        model_complexity=1,
    ) as pose:

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("No frame — camera disconnected?")
                break

            # Share raw frame with MJPEG server immediately
            with _raw_lock:
                _raw_frame = frame.copy()

            h, w = frame.shape[:2]
            timestamp = time.time() - start_time

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)

            state = FallState.NORMAL
            debug: Dict[str, Any] = {}

            if results.pose_landmarks:
                lm = results.pose_landmarks.landmark
                pts = get_keypoints(lm, h, w)

                torso_angle = compute_torso_angle(pts)
                hip_y       = compute_vertical_position(pts, h)
                velocity    = compute_landmark_velocity(prev_pts, pts, h, w)

                state = detector.update(torso_angle, hip_y, velocity, timestamp)

                # Fall transition → fire alert
                if last_state != FallState.CONFIRMED_FALL and state == FallState.CONFIRMED_FALL:
                    image_b64 = None
                    ok_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    if ok_enc:
                        image_b64 = base64.b64encode(buf).decode("utf-8")

                    payload = _build_payload(patient, monitoring, image_b64)

                    if on_fall:
                        # Fire in a thread so the detection loop never blocks
                        threading.Thread(target=on_fall, args=(payload,), daemon=True).start()
                    else:
                        print("FALL_PAYLOAD:", {**payload, "image": "<captured>" if image_b64 else None})
                        if image_b64:
                            with open("fall_capture.jpg", "wb") as f:
                                f.write(base64.b64decode(image_b64))
                            print("Saved fall_capture.jpg")

                last_state = state

                debug = detector.get_debug_info()
                debug["torso_angle"] = torso_angle
                debug["velocity"]    = velocity
                prev_pts = pts

                color = STATE_COLORS[state]
                mp_draw.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_pose_module.POSE_CONNECTIONS,
                    mp_draw.DrawingSpec(color=color, thickness=2, circle_radius=3),
                    mp_draw.DrawingSpec(color=color, thickness=2),
                )

            _draw_hud(frame, state, debug, w, h)

            if show_gui:
                cv2.imshow("Fall Detection", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    cap.release()
    if show_gui:
        cv2.destroyAllWindows()

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def fetch_patient(nextjs_url: str):
    """Fetch the first registered patient from Next.js at startup."""
    try:
        r = requests.get(f"{nextjs_url}/api/patients", timeout=5)
        patients = r.json()
        if patients:
            p = patients[0]
            patient = {"id": p["id"], "name": p["name"]}
            monitoring = {"location": p["location"], "cameraNumber": p["cameraNumber"]}
            print(f"Loaded patient: {patient['name']} — {monitoring['location']} cam {monitoring['cameraNumber']}")
            return patient, monitoring
    except Exception as e:
        print(f"Could not fetch patient from Next.js: {e}")
    print("Warning: using default patient info")
    return None, None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="0", help="Camera index (default 0)")
    parser.add_argument("--port", type=int, default=8000, help="MJPEG server port")
    parser.add_argument("--immobility-seconds", type=float, default=5.0)
    parser.add_argument("--nextjs-url", default="", help="e.g. http://192.168.1.55:3000")
    parser.add_argument("--gui", action="store_true", help="Show OpenCV window (desktop only)")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source

    # Fetch patient info from Next.js so it matches what was registered
    patient, monitoring = (None, None)
    if args.nextjs_url:
        patient, monitoring = fetch_patient(args.nextjs_url)

    def post_fall(payload: Dict[str, Any]):
        if not args.nextjs_url:
            print("FALL detected (no --nextjs-url set, skipping POST)")
            return
        try:
            r = requests.post(
                f"{args.nextjs_url}/api/fall",
                json=payload,
                timeout=5,
            )
            print(f"Alert posted → {r.status_code}")
        except Exception as e:
            print(f"Failed to post alert: {e}")

    run(
        source=source,
        flask_port=args.port,
        immobility_confirm_seconds=args.immobility_seconds,
        on_fall=post_fall,
        show_gui=args.gui,
        patient=patient,
        monitoring=monitoring,
    )