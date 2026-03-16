"""
Gaze & Posture Estimator Module
---------------------------------
MediaPipe Holistic landmarks를 사용해서 세 가지를 탐지

  1. 시선(Gaze)    : iris 위치 → yaw/pitch 편향 비율
  2. 머리(Head)    : solvePnP  → pitch / yaw / roll 각도 (도)
  3. 어깨(Shoulder): 어깨 두 점 → 기울기 비율 / 각도

버전 정보
Python 3.9+ / mediapipe 0.10.x 호환
"""

from collections import deque
import numpy as np
import cv2


# ─── Face landmark indices ────────────────────────────────────────────────────
# (Holistic refine_face_landmarks=True → 478-point)

LEFT_IRIS   = [468, 469, 470, 471, 472]   # center, top, right, bottom, left
RIGHT_IRIS  = [473, 474, 475, 476, 477]

LEFT_EYE_CORNERS  = {"inner": 133, "outer": 33}
RIGHT_EYE_CORNERS = {"inner": 362, "outer": 263}

LEFT_EYE_TOP_BOTTOM  = {"top": 159, "bottom": 145}
RIGHT_EYE_TOP_BOTTOM = {"top": 386, "bottom": 374}

# solvePnP에 사용할 face landmark 인덱스
HEAD_POSE_LM_IDX = [1, 152, 33, 263, 61, 291]
# 대응하는 일반적인 3D 얼굴 모델 좌표 (mm 단위, 원점=코끝)
HEAD_POSE_3D = np.array([
    [ 0.0,    0.0,    0.0],    # 코끝       (1)
    [ 0.0,  -63.6,  -12.5],   # 턱         (152)
    [-43.3,   32.7,  -26.0],  # 왼쪽 눈 외각 (33)
    [ 43.3,   32.7,  -26.0],  # 오른쪽 눈 외각 (263)
    [-28.9,  -28.9,  -24.1],  # 왼쪽 입 꼭지 (61)
    [ 28.9,  -28.9,  -24.1],  # 오른쪽 입 꼭지 (291)
], dtype=np.float64)


# ─── Pose landmark indices ────────────────────────────────────────────────────

POSE_LEFT_SHOULDER  = 11
POSE_RIGHT_SHOULDER = 12
SHOULDER_VISIBILITY_MIN = 0.5


# ─── 스무딩 윈도우 ────────────────────────────────────────────────────────────

SMOOTHING_FRAMES = 10


# ─── 유틸 ────────────────────────────────────────────────────────────────────

def _face_lm_px(landmarks, idx: int, img_w: int, img_h: int) -> np.ndarray:
    p = landmarks[idx]
    return np.array([p.x * img_w, p.y * img_h], dtype=np.float32)


def _pose_lm_px(landmarks, idx: int, img_w: int, img_h: int):
    """(픽셀 좌표, visibility) 반환"""
    p = landmarks[idx]
    return np.array([p.x * img_w, p.y * img_h], dtype=np.float32), float(p.visibility)


# ─── 1. 시선 탐지 ─────────────────────────────────────────────────────────────

def _analyze_single_eye(face_lms, iris_idx, corner_idx, tb_idx, img_w, img_h):
    """
    한쪽 눈의 iris 편향 비율과 EAR을 계산한다.

    Returns dict | None:
        yaw_ratio   : 좌우 편향  -1(left) ~ +1(right), 0=중앙
        pitch_ratio : 상하 편향  -1(up)   ~ +1(down),  0=중앙
        ear         : Eye Aspect Ratio
        iris_center : (x, y) 픽셀
        eye_mid     : 눈 중심 픽셀
    """
    iris  = _face_lm_px(face_lms, iris_idx[0],       img_w, img_h)
    inner = _face_lm_px(face_lms, corner_idx["inner"], img_w, img_h)
    outer = _face_lm_px(face_lms, corner_idx["outer"], img_w, img_h)
    top   = _face_lm_px(face_lms, tb_idx["top"],       img_w, img_h)
    bot   = _face_lm_px(face_lms, tb_idx["bottom"],    img_w, img_h)

    eye_mid   = (inner + outer) / 2.0
    eye_w     = float(np.linalg.norm(inner - outer))
    eye_h     = float(np.linalg.norm(top   - bot))

    if eye_w < 1e-6 or eye_h < 1e-6:
        return None

    offset = iris - eye_mid
    return {
        "yaw_ratio":   float(np.clip(offset[0] / (eye_w / 2.0), -1, 1)),
        "pitch_ratio": float(np.clip(offset[1] / (eye_h / 2.0), -1, 1)),
        "ear":         float(eye_h / eye_w),
        "iris_center": iris,
        "eye_mid":     eye_mid,
        "eye_width":   eye_w,
        "eye_height":  eye_h,
    }


def estimate_gaze(face_landmarks, img_w: int, img_h: int):
    """
    양쪽 눈 iris 위치로 시선 편향을 추정한다.
    face_landmarks : results.face_landmarks.landmark

    Returns dict | None:
        yaw_ratio   : 좌우 평균 편향
        pitch_ratio : 상하 평균 편향
        left_ear    : 왼쪽 EAR
        right_ear   : 오른쪽 EAR
        left        : 왼쪽 눈 상세
        right       : 오른쪽 눈 상세
    """
    lms = face_landmarks
    L = _analyze_single_eye(lms, LEFT_IRIS,  LEFT_EYE_CORNERS,  LEFT_EYE_TOP_BOTTOM,  img_w, img_h)
    R = _analyze_single_eye(lms, RIGHT_IRIS, RIGHT_EYE_CORNERS, RIGHT_EYE_TOP_BOTTOM, img_w, img_h)

    if L is None or R is None:
        return None

    return {
        "yaw_ratio":   (L["yaw_ratio"]   + R["yaw_ratio"])   / 2.0,
        "pitch_ratio": (L["pitch_ratio"] + R["pitch_ratio"]) / 2.0,
        "left_ear":    L["ear"],
        "right_ear":   R["ear"],
        "left":        L,
        "right":       R,
    }


# ─── 2. 머리 방향 탐지 (Head Pose) ───────────────────────────────────────────

def estimate_head_pose(face_landmarks, img_w: int, img_h: int):
    """
    cv2.solvePnP로 머리의 3D 방향각을 추정한다.
    face_landmarks : results.face_landmarks.landmark

    Returns dict | None:
        pitch : 상하 고개 각도 (도)  양수=아래로 숙임, 음수=위로 듦
        yaw   : 좌우 고개 각도 (도)  양수=오른쪽, 음수=왼쪽
        roll  : 머리 기울기 (도)     양수=오른쪽으로 기울음
        nose_tip : 코끝 픽셀 좌표
    """
    lms = face_landmarks

    pts_2d = np.array(
        [[lms[i].x * img_w, lms[i].y * img_h] for i in HEAD_POSE_LM_IDX],
        dtype=np.float64
    )

    focal   = img_w
    cam_mat = np.array([
        [focal, 0,     img_w / 2],
        [0,     focal, img_h / 2],
        [0,     0,     1        ],
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    ok, rot_vec, trans_vec = cv2.solvePnP(
        HEAD_POSE_3D, pts_2d, cam_mat, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not ok:
        return None

    rot_mat, _ = cv2.Rodrigues(rot_vec)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rot_mat)

    nose_tip = (int(lms[1].x * img_w), int(lms[1].y * img_h))

    return {
        "pitch":     float(angles[0]),   # 상하
        "yaw":       float(angles[1]),   # 좌우
        "roll":      float(angles[2]),   # 기울기
        "rot_vec":   rot_vec,
        "trans_vec": trans_vec,
        "cam_mat":   cam_mat,
        "nose_tip":  nose_tip,
    }


# ─── 3. 어깨 자세 탐지 ───────────────────────────────────────────────────────

def analyze_posture(pose_landmarks, img_w: int, img_h: int):
    """
    양쪽 어깨 좌표로 어깨 기울기를 계산한다.
    pose_landmarks : results.pose_landmarks

    Returns dict | None:
        both_visible         : 양 어깨 감지 여부
        shoulder_tilt_ratio  : (left_y - right_y) / shoulder_width
                               0=수평, |값| 클수록 기울음
        tilt_deg             : 어깨선 기울기 각도 (도)
        shoulder_width_ratio : shoulder_width / img_w
        left_pt, right_pt    : 픽셀 좌표
    """
    if pose_landmarks is None:
        return None

    lms = pose_landmarks.landmark
    lp, lv = _pose_lm_px(lms, POSE_LEFT_SHOULDER,  img_w, img_h)
    rp, rv = _pose_lm_px(lms, POSE_RIGHT_SHOULDER, img_w, img_h)

    both_visible = (lv >= SHOULDER_VISIBILITY_MIN and
                    rv >= SHOULDER_VISIBILITY_MIN)
    sh_width     = float(np.linalg.norm(rp - lp))

    if not both_visible or sh_width < 1e-6:
        return {
            "both_visible":         False,
            "shoulder_tilt_ratio":  0.0,
            "shoulder_width_ratio": 0.0,
            "tilt_deg":             0.0,
            "left_pt":              lp,
            "right_pt":             rp,
        }

    tilt_ratio = (lp[1] - rp[1]) / sh_width
    tilt_deg   = float(np.degrees(
        np.arctan2(float(lp[1] - rp[1]), max(float(rp[0] - lp[0]), 1e-6))
    ))

    return {
        "both_visible":         True,
        "shoulder_tilt_ratio":  float(tilt_ratio),
        "shoulder_width_ratio": float(sh_width / img_w),
        "tilt_deg":             tilt_deg,
        "left_pt":              lp,
        "right_pt":             rp,
    }


# ─── 스무더 ──────────────────────────────────────────────────────────────────

class GazeSmoother:
    """iris 편향 비율의 이동 평균으로 떨림을 줄인다."""

    def __init__(self, window: int = SMOOTHING_FRAMES):
        self._yaw:   deque = deque(maxlen=window)
        self._pitch: deque = deque(maxlen=window)

    def update(self, gaze_info: dict | None) -> dict | None:
        if gaze_info is None:
            return None
        self._yaw.append(gaze_info["yaw_ratio"])
        self._pitch.append(gaze_info["pitch_ratio"])
        out = dict(gaze_info)
        out["yaw_ratio"]   = float(np.mean(self._yaw))
        out["pitch_ratio"] = float(np.mean(self._pitch))
        return out

    def reset(self):
        self._yaw.clear()
        self._pitch.clear()


class HeadPoseSmoother:
    """머리 각도의 이동 평균으로 떨림을 줄인다."""

    def __init__(self, window: int = SMOOTHING_FRAMES):
        self._pitch: deque = deque(maxlen=window)
        self._yaw:   deque = deque(maxlen=window)
        self._roll:  deque = deque(maxlen=window)

    def update(self, head_info: dict | None) -> dict | None:
        if head_info is None:
            return None
        self._pitch.append(head_info["pitch"])
        self._yaw.append(head_info["yaw"])
        self._roll.append(head_info["roll"])
        out = dict(head_info)
        out["pitch"] = float(np.mean(self._pitch))
        out["yaw"]   = float(np.mean(self._yaw))
        out["roll"]  = float(np.mean(self._roll))
        return out

    def reset(self):
        self._pitch.clear()
        self._yaw.clear()
        self._roll.clear()


class PostureSmoother:
    """어깨 기울기의 이동 평균으로 떨림을 줄인다."""

    def __init__(self, window: int = SMOOTHING_FRAMES):
        self._tilt: deque = deque(maxlen=window)

    def update(self, posture_info: dict | None) -> dict | None:
        if posture_info is None or not posture_info["both_visible"]:
            return posture_info
        self._tilt.append(posture_info["shoulder_tilt_ratio"])
        out = dict(posture_info)
        out["shoulder_tilt_ratio"] = float(np.mean(self._tilt))
        return out

    def reset(self):
        self._tilt.clear()


# ─── 캘리브레이션 (시선 오프셋 보정) ─────────────────────────────────────────

CALIBRATION_FRAMES = 150   # 약 5초 @ 30fps


class GazeCalibrator:
    """
    시작 후 N 프레임 동안 정면 gaze를 수집하여
    개인별 yaw/pitch 오프셋을 보정한다.

    c 키 → reset() 으로 재캘리브레이션.
    """

    def __init__(self, frames: int = CALIBRATION_FRAMES):
        self._target    = frames
        self._yaw_buf:   list = []
        self._pitch_buf: list = []
        self.yaw_offset   = 0.0
        self.pitch_offset = 0.0
        self.is_calibrated = False

    @property
    def progress(self) -> float:
        return min(len(self._yaw_buf) / self._target, 1.0)

    def update_and_apply(self, gaze_info: dict | None) -> dict | None:
        if gaze_info is None:
            return None

        if not self.is_calibrated:
            self._yaw_buf.append(gaze_info["yaw_ratio"])
            self._pitch_buf.append(gaze_info["pitch_ratio"])
            if len(self._yaw_buf) >= self._target:
                self.yaw_offset   = float(np.mean(self._yaw_buf))
                self.pitch_offset = float(np.mean(self._pitch_buf))
                self.is_calibrated = True
            return gaze_info   # 캘리브레이션 중에는 원본 반환

        out = dict(gaze_info)
        out["yaw_ratio"]   = float(np.clip(
            gaze_info["yaw_ratio"]   - self.yaw_offset,   -1.0, 1.0))
        out["pitch_ratio"] = float(np.clip(
            gaze_info["pitch_ratio"] - self.pitch_offset, -1.0, 1.0))
        return out

    def reset(self):
        self._yaw_buf.clear()
        self._pitch_buf.clear()
        self.yaw_offset   = 0.0
        self.pitch_offset = 0.0
        self.is_calibrated = False
