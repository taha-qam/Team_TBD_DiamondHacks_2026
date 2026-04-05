import cv2
import mediapipe as mp
import time
import numpy as np
import os
import sys
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Callable, Optional, Dict, Any

from features import get_keypoints, compute_torso_angle, compute_vertical_position, compute_landmark_velocity
from fall_detector import FallDetector, FallState

# Color map for each state
STATE_COLORS = {
    FallState.NORMAL:        (0, 200, 0),    # Green
    FallState.POSSIBLE_FALL: (0, 165, 255),  # Orange
    FallState.CONFIRMED_FALL:(0, 0, 255),    # Red
}

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _build_fall_payload(
    *,
    patient: Dict[str, Any],
    monitoring: Dict[str, Any],
    image_b64: Optional[str] = None, 
) -> Dict[str, Any]:

    return {
        "timestamp": _iso_now(),
        "patient": patient,         # e.g. {"id": "...", "name": "..."}
        "monitoring": monitoring,   # e.g. {"location": "living room", "cameraNumber": 3}
        "image": image_b64,
    }


def _default_show_gui() -> bool:
    # Conservative default:
    # - On many headless/SSH Linux setups, DISPLAY can be set but unusable, and
    #   any cv2 HighGUI call (imshow/waitKey) will crash with Qt/xcb errors.
    # - Users on Linux desktops can explicitly opt in via --gui.
    if sys.platform.startswith("linux"):
        return False
    return True


def _is_http_source(source: object) -> bool:
    if not isinstance(source, str):
        return False
    s = source.strip().lower()
    return s.startswith("http://") or s.startswith("https://")


@contextmanager
def _open_mjpeg_stream(url: str, *, timeout_seconds: float = 10.0):
    # Uses stdlib urllib to avoid extra dependencies on the Pi.
    # Reads a multipart/x-mixed-replace MJPEG stream and yields decoded frames.
    # Many OpenCV builds cannot decode these streams via VideoCapture(url).
    resp = urllib.request.urlopen(url, timeout=timeout_seconds)
    try:
        yield resp
    finally:
        try:
            resp.close()
        except Exception:
            pass


def _iter_frames_from_mjpeg(resp, *, max_buffer_bytes: int = 5_000_000):
    # Parse by JPEG SOI/EOI markers inside the multipart stream.
    # This ignores boundaries and works with most simple MJPEG servers.
    buffer = b""
    while True:
        chunk = resp.read(4096)
        if not chunk:
            return
        buffer += chunk

        start = buffer.find(b"\xff\xd8")
        end = buffer.find(b"\xff\xd9", start + 2)
        if start != -1 and end != -1:
            jpg = buffer[start : end + 2]
            buffer = buffer[end + 2 :]
            arr = np.frombuffer(jpg, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is not None:
                yield frame

        # Prevent unbounded growth if the stream is malformed or slow.
        if len(buffer) > max_buffer_bytes:
            buffer = buffer[-1_000_000:]

def run(
    source=0,
    immobility_confirm_seconds=5.0,
    fps_override=None,
    patient: Optional[Dict[str, Any]] = None,
    monitoring: Optional[Dict[str, Any]] = None,
    on_fall: Optional[Callable[[Dict[str, Any]], None]] = None,
    show_gui: Optional[bool] = None,
):
    if show_gui is None:
        show_gui = _default_show_gui()

    patient = patient or {"id": "patient-001", "name": "Evelyn Carter"}
    monitoring = monitoring or {"location": "living room", "cameraNumber": 3}
    last_state = FallState.NORMAL
    mp_pose = mp.solutions.pose
    mp_draw = mp.solutions.drawing_utils

    use_mjpeg = _is_http_source(source)
    cap = None
    if not use_mjpeg:
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"Could not open video source: {source!r}")
            return
        fps = fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0
    else:
        fps = fps_override or 30.0

    detector = FallDetector(
        immobility_confirm_seconds=immobility_confirm_seconds,
        fps=fps,
    )

    prev_pts = None
    start_time = time.time()

    with mp_pose.Pose(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        model_complexity=1,          # 0=fast, 1=balanced, 2=accurate
    ) as pose:

        if use_mjpeg:
            print(f"Reading MJPEG stream: {source}")
            with _open_mjpeg_stream(str(source)) as resp:
                for frame in _iter_frames_from_mjpeg(resp):
                    h, w = frame.shape[:2]
                    timestamp = time.time() - start_time

                    # MediaPipe expects RGB
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = pose.process(rgb)

                    state = FallState.NORMAL
                    debug = {}

                    if results.pose_landmarks:
                        lm = results.pose_landmarks.landmark
                        pts = get_keypoints(lm, h, w)

                        torso_angle   = compute_torso_angle(pts)
                        hip_y         = compute_vertical_position(pts, h)
                        velocity      = compute_landmark_velocity(prev_pts, pts, h, w)

                        state = detector.update(torso_angle, hip_y, velocity, timestamp)
                        if last_state != FallState.CONFIRMED_FALL and state == FallState.CONFIRMED_FALL:
                            image_b64 = None
                            ret_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                            if ret_enc:
                                import base64
                                image_b64 = base64.b64encode(buf).decode("utf-8")

                            payload = _build_fall_payload(
                                patient=patient,
                                monitoring=monitoring,
                                image_b64=image_b64,
                            )
                            if on_fall:
                                on_fall(payload)
                            else:
                                print("FALL_PAYLOAD:", {**payload, "image": "<captured>"})
                                if image_b64:
                                    import base64
                                    with open("fall_capture.jpg", "wb") as f:
                                        f.write(base64.b64decode(image_b64))
                                    print("Image saved to fall_capture.jpg")

                        last_state = state

                        debug = detector.get_debug_info()
                        debug["torso_angle"] = torso_angle
                        debug["velocity"] = velocity

                        prev_pts = pts

                        color = STATE_COLORS[state]
                        mp_draw.draw_landmarks(
                            frame,
                            results.pose_landmarks,
                            mp_pose.POSE_CONNECTIONS,
                            mp_draw.DrawingSpec(color=color, thickness=2, circle_radius=3),
                            mp_draw.DrawingSpec(color=color, thickness=2),
                        )

                    _draw_hud(frame, state, debug, w, h)

                    if show_gui:
                        cv2.imshow("Fall Detection", frame)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            break
        else:
            assert cap is not None
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    print("No frame received; exiting.")
                    break

                h, w = frame.shape[:2]
                timestamp = time.time() - start_time

                # MediaPipe expects RGB
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(rgb)

                state = FallState.NORMAL
                debug = {}

                if results.pose_landmarks:
                    lm = results.pose_landmarks.landmark
                    pts = get_keypoints(lm, h, w)

                    torso_angle   = compute_torso_angle(pts)
                    hip_y         = compute_vertical_position(pts, h)
                    velocity      = compute_landmark_velocity(prev_pts, pts, h, w)

                    state = detector.update(torso_angle, hip_y, velocity, timestamp)
                    # After: state = detector.update(...)
                    if last_state != FallState.CONFIRMED_FALL and state == FallState.CONFIRMED_FALL:
                        # Encode the current frame as a base64 JPEG
                        image_b64 = None
                        ret_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        if ret_enc:
                            import base64
                            image_b64 = base64.b64encode(buf).decode("utf-8")

                        payload = _build_fall_payload(
                            patient=patient,
                            monitoring=monitoring,
                            image_b64=image_b64,
                        )
                        if on_fall:
                            on_fall(payload)
                        else:
                            # default behavior for now
                            print("FALL_PAYLOAD:", {**payload, "image": "<captured>"})

                            if image_b64:
                                import base64
                                with open("fall_capture.jpg", "wb") as f:
                                    f.write(base64.b64decode(image_b64))
                                print("Image saved to fall_capture.jpg")

                    last_state = state

                    debug = detector.get_debug_info()
                    debug["torso_angle"] = torso_angle
                    debug["velocity"] = velocity

                    prev_pts = pts

                    # Draw skeleton
                    color = STATE_COLORS[state]
                    mp_draw.draw_landmarks(
                        frame,
                        results.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                        mp_draw.DrawingSpec(color=color, thickness=2, circle_radius=3),
                        mp_draw.DrawingSpec(color=color, thickness=2),
                    )

                # --- HUD overlay ---
                _draw_hud(frame, state, debug, w, h)

                if show_gui:
                    cv2.imshow("Fall Detection", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

    if cap is not None:
        cap.release()
    if show_gui:
        cv2.destroyAllWindows()


def _draw_hud(frame, state, debug, w, h):
    color = STATE_COLORS.get(state, (255, 255, 255))
    label = state.value.upper().replace("_", " ")

    # State banner
    cv2.rectangle(frame, (0, 0), (w, 40), (0, 0, 0), -1)
    cv2.putText(frame, label, (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)

    # Debug metrics
    y = 70
    for key, val in debug.items():
        if key == "state":
            continue
        if isinstance(val, float):
            text = f"{key}: {val:.3f}"
        else:
            text = f"{key}: {val}"
        cv2.putText(frame, text, (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        y += 20

    # Alert box for confirmed fall
    if state == FallState.CONFIRMED_FALL:
        cv2.rectangle(frame, (0, h - 50), (w, h), (0, 0, 180), -1)
        cv2.putText(frame, "⚠ FALL DETECTED — ALERT TRIGGERED",
                    (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="0", help="Webcam index (e.g. 0) OR a video path OR an http(s) URL")
    parser.add_argument("--immobility-seconds", type=float, default=5.0)
    parser.add_argument("--no-gui", action="store_true", help="Disable OpenCV GUI windows (recommended on headless Linux/SSH)")
    parser.add_argument("--gui", action="store_true", help="Force-enable OpenCV GUI windows (Linux desktops only)")
    args = parser.parse_args()

    source = int(args.source) if str(args.source).isdigit() else args.source

    if args.gui and args.no_gui:
        raise SystemExit("Choose either --gui or --no-gui (not both).")

    run(
        source=source,
        immobility_confirm_seconds=args.immobility_seconds,
        show_gui=(True if args.gui else (False if args.no_gui else None)),
    )