from collections import deque
from enum import Enum
import time

class FallState(Enum):
    NORMAL = "normal"
    POSSIBLE_FALL = "possible_fall"
    CONFIRMED_FALL = "confirmed_fall"

class FallDetector:
    def __init__(
        self,
        # Torso angle threshold: above this = near-horizontal
        torso_angle_threshold: float = 60.0,
        # Hip Y drop threshold (normalized 0-1): how far hips must fall
        vertical_drop_threshold: float = 0.12,
        # How many frames to track for the drop velocity
        drop_window_frames: int = 10,
        # Immobility: max normalized velocity to count as "not moving"
        immobility_velocity_threshold: float = 0.005,
        # How long (seconds) immobility must persist to confirm fall
        immobility_confirm_seconds: float = 5.0,
        # FPS (used for immobility timing)
        fps: float = 30.0,
    ):
        self.torso_angle_threshold = torso_angle_threshold
        self.vertical_drop_threshold = vertical_drop_threshold
        self.drop_window_frames = drop_window_frames
        self.immobility_velocity_threshold = immobility_velocity_threshold
        self.immobility_confirm_seconds = immobility_confirm_seconds
        self.fps = fps

        # Sliding window of recent hip Y positions
        self._hip_y_history = deque(maxlen=drop_window_frames)
        
        # State tracking
        self.state = FallState.NORMAL
        self._possible_fall_start_time = None
        self._immobility_start_time = None

    def update(
        self,
        torso_angle: float,
        hip_y_normalized: float,
        landmark_velocity: float,
        timestamp: float,  # seconds
    ) -> FallState:
        
        self._hip_y_history.append(hip_y_normalized)

        # --- Trigger detection ---
        sudden_drop = self._detect_sudden_drop()
        near_horizontal = torso_angle > self.torso_angle_threshold
        trigger = sudden_drop or near_horizontal

        # --- State transitions ---
        if self.state == FallState.NORMAL:
            if trigger:
                self.state = FallState.POSSIBLE_FALL
                self._possible_fall_start_time = timestamp
                self._immobility_start_time = None

        elif self.state == FallState.POSSIBLE_FALL:
            is_immobile = landmark_velocity < self.immobility_velocity_threshold

            if is_immobile:
                if self._immobility_start_time is None:
                    self._immobility_start_time = timestamp
                
                immobile_duration = timestamp - self._immobility_start_time
                if immobile_duration >= self.immobility_confirm_seconds:
                    self.state = FallState.CONFIRMED_FALL

            else:
                # Person moved — reset immobility timer but stay in possible_fall
                # if the trigger condition is still active
                self._immobility_start_time = None

                if not trigger:
                    # Trigger cleared and person is moving = false alarm
                    self.state = FallState.NORMAL
                    self._possible_fall_start_time = None

        elif self.state == FallState.CONFIRMED_FALL:
            # Only exit if person is clearly upright again
            if torso_angle < 30.0 and not sudden_drop:
                self.state = FallState.NORMAL
                self._possible_fall_start_time = None
                self._immobility_start_time = None

        return self.state

    def _detect_sudden_drop(self) -> bool:
        """True if hips dropped significantly within the tracking window."""
        if len(self._hip_y_history) < self.drop_window_frames:
            return False
        # Compare earliest vs latest Y — higher Y value = lower on screen
        drop = self._hip_y_history[-1] - self._hip_y_history[0]
        return drop > self.vertical_drop_threshold

    def get_debug_info(self) -> dict:
        return {
            "state": self.state.value,
            "hip_y": self._hip_y_history[-1] if self._hip_y_history else None,
            "hip_drop": (
                self._hip_y_history[-1] - self._hip_y_history[0]
                if len(self._hip_y_history) == self.drop_window_frames
                else 0
            ),
        }