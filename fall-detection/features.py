import numpy as np
import mediapipe as mp

# Key landmark indices from MediaPipe's 33-point model
LANDMARKS = {
    "nose": 0,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_hip": 23,      "right_hip": 24,
    "left_knee": 25,     "right_knee": 26,
    "left_ankle": 27,    "right_ankle": 28,
}

def get_keypoints(landmarks, frame_h, frame_w):
    """Extract normalized (x, y) for key joints. Y=0 is top of frame."""
    pts = {}
    for name, idx in LANDMARKS.items():
        lm = landmarks[idx]
        pts[name] = np.array([lm.x * frame_w, lm.y * frame_h])
    return pts

def compute_torso_angle(pts):
    """
    Angle of the torso line (mid-hip → mid-shoulder) relative to vertical.
    0° = upright, 90° = fully horizontal (lying down).
    """
    mid_hip = (pts["left_hip"] + pts["right_hip"]) / 2
    mid_shoulder = (pts["left_shoulder"] + pts["right_shoulder"]) / 2

    delta = mid_shoulder - mid_hip  # vector pointing upward when standing
    # Angle from vertical axis (positive Y points DOWN in image coords)
    angle_rad = np.arctan2(abs(delta[0]), abs(delta[1]))
    return np.degrees(angle_rad)  # 0=vertical, 90=horizontal

def compute_vertical_position(pts, frame_h):
    """
    Returns normalized Y position of mid-hip (0=top, 1=bottom of frame).
    A sudden increase = downward drop.
    """
    mid_hip = (pts["left_hip"] + pts["right_hip"]) / 2
    return mid_hip[1] / frame_h

def compute_landmark_velocity(prev_pts, curr_pts, frame_h, frame_w):
    """
    Mean pixel displacement of all key joints between two frames.
    Low value = person is stationary (immobility check).
    """
    if prev_pts is None:
        return float("inf")
    
    velocities = []
    for name in LANDMARKS:
        if name in prev_pts and name in curr_pts:
            disp = np.linalg.norm(curr_pts[name] - prev_pts[name])
            # Normalize by frame diagonal so it's resolution-independent
            disp /= np.sqrt(frame_h**2 + frame_w**2)
            velocities.append(disp)
    return np.mean(velocities) if velocities else 0.0