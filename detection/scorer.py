"""
Scorer Module
-------------
gaze_estimator.py의 detection 결과(gaze / head / posture)를 받아
매 프레임 점수를 계산하고, 상태(status)는 N 프레임 연속 확인 후 전환한다.

출력:
    focus_score  : 0.0 ~ 1.0  (높을수록 집중)
    fatigue_score: 0.0 ~ 1.0  (높을수록 피로)
    status       : "focused" | "distracted" | "drowsy" | "uncertain"
"""

from collections import deque
from dataclasses import dataclass, field
from typing import Optional


# ─── 임계값 상수 ──────────────────────────────────────────────────────────────

# 시선 (gaze_ratio: -1 ~ +1)
GAZE_YAW_THRESH   = 0.30   # 좌우 ±30% 이내 → 화면 응시
GAZE_PITCH_THRESH = 0.30   # 상하 ±30% 이내 → 화면 응시

# 고개 방향 (solvePnP 각도, 단위: 도)
HEAD_PITCH_THRESH = 15.0   # 고개 상하 ±15° 이내
HEAD_YAW_THRESH   = 20.0   # 고개 좌우 ±20° 이내

# 눈 종횡비 (EAR: Eye Aspect Ratio)
EAR_NORMAL = 0.28          # 정상적으로 눈을 뜬 상태
EAR_DROWSY = 0.20          # 이 미만이면 눈이 감기는 중

# 고개 숙임 (졸음 판단용)
HEAD_PITCH_DROWSY = 15.0   # 고개가 이 이상 아래로 숙여지면 졸음 조건

# 어깨 기울기 (shoulder_tilt_ratio 기준)
SHOULDER_TILT_THRESH = 0.12   # 이 이상 기울면 자세 불량
SHOULDER_TILT_DROWSY = 0.15   # 졸음 판단 시 추가 조건 (더 관대하게)

# 가중치 (합 = 1.0)
GAZE_WEIGHT     = 0.55
HEAD_WEIGHT     = 0.35
SHOULDER_WEIGHT = 0.10

# 상태 전환 확인 프레임 수 (30fps 기준)
#   느리게 진행되는 상태(졸음)는 길게, 즉각성이 필요한 상태는 짧게
CONFIRM_FRAMES = {
    "focused":    10,   # ~0.33초
    "distracted": 15,   # ~0.50초
    "drowsy":     20,   # ~0.67초
    "uncertain":   5,
}


# ─── 결과 데이터클래스 ────────────────────────────────────────────────────────

@dataclass
class ScoreResult:
    focus_score:    float          # 0.0 ~ 1.0
    fatigue_score:  float          # 0.0 ~ 1.0
    status:         str            # 확정된 상태
    candidate:      str            # 현재 프레임의 후보 상태
    confirm_ratio:  float          # 전환까지 남은 진행률 (0.0 ~ 1.0)
    gaze_score:     float          # 시선 서브스코어
    head_score:     float          # 고개 서브스코어
    shoulder_score: float          # 어깨 서브스코어
    avg_ear:        float          # 평균 EAR


# ─── 유틸 ────────────────────────────────────────────────────────────────────

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _linear_score(value: float, threshold: float) -> float:
    """
    |value| == 0        → 1.0 (최고)
    |value| == threshold → 0.0
    그 이상             → 0.0 (클램프)
    """
    return _clamp(1.0 - abs(value) / threshold, 0.0, 1.0)


# ─── 메인 스코어러 ────────────────────────────────────────────────────────────

class FocusScorer:
    """
    매 프레임 detection 결과를 받아 점수와 상태를 반환한다.

    상태 전환 규칙:
        candidate가 CONFIRM_FRAMES 이상 연속되어야 status가 바뀐다.
        candidate가 끊기면 카운터가 리셋된다.
    """

    def __init__(self):
        self._status: str = "uncertain"
        self._candidate: str = "uncertain"
        self._confirm_count: int = 0

    # ── 점수 계산 ──────────────────────────────────────────────────────────────

    @staticmethod
    def _calc_focus(gaze_info:    Optional[dict],
                    head_info:    Optional[dict],
                    posture_info: Optional[dict]) -> tuple[float, float, float, float]:
        """
        Returns (focus_score, gaze_score, head_score, shoulder_score)  모두 0.0~1.0
        """
        if gaze_info is None:
            return 0.0, 0.0, 0.0, 0.0

        # 시선: yaw·pitch 각각 선형 감쇠, 곱으로 결합
        gaze_score = (
            _linear_score(gaze_info["yaw_ratio"],   GAZE_YAW_THRESH)
            * _linear_score(gaze_info["pitch_ratio"], GAZE_PITCH_THRESH)
        )

        # 고개: pitch·yaw 평균 선형 감쇠
        if head_info is not None:
            head_score = (
                _linear_score(head_info["pitch"], HEAD_PITCH_THRESH)
                + _linear_score(head_info["yaw"],   HEAD_YAW_THRESH)
            ) / 2.0
        else:
            head_score = 0.5   # 고개 미감지 → 중립값

        # 어깨: tilt_ratio 선형 감쇠 (양쪽 어깨가 감지된 경우에만)
        if posture_info is not None and posture_info.get("both_visible"):
            shoulder_score = _linear_score(
                posture_info["shoulder_tilt_ratio"], SHOULDER_TILT_THRESH
            )
        else:
            shoulder_score = 0.5   # 어깨 미감지 → 중립값

        focus_score = _clamp(
            gaze_score     * GAZE_WEIGHT
            + head_score   * HEAD_WEIGHT
            + shoulder_score * SHOULDER_WEIGHT,
            0.0, 1.0
        )
        return focus_score, gaze_score, head_score, shoulder_score

    @staticmethod
    def _calc_fatigue(gaze_info: Optional[dict]) -> tuple[float, float]:
        """
        Returns (fatigue_score, avg_ear)

        EAR이 낮을수록 피로도 상승.
        EAR_NORMAL 이상 → 0.0, EAR_DROWSY 이하 → 1.0 (선형 보간)
        """
        if gaze_info is None:
            return 0.0, 0.0

        avg_ear = (gaze_info["left_ear"] + gaze_info["right_ear"]) / 2.0
        span = EAR_NORMAL - EAR_DROWSY  # 0.08
        fatigue = _clamp(1.0 - (avg_ear - EAR_DROWSY) / span, 0.0, 1.0)
        return fatigue, avg_ear

    # ── 상태 분류 ─────────────────────────────────────────────────────────────

    @staticmethod
    def _classify(gaze_info:    Optional[dict],
                  head_info:    Optional[dict],
                  posture_info: Optional[dict],
                  avg_ear:      float) -> str:
        """
        매 프레임 "후보 상태"를 결정한다.
        우선순위: uncertain > drowsy > focused > distracted

        졸음 판단:
            EAR 낮음  AND  (고개 숙임  OR  어깨 과도한 기울기)
            어깨는 보조 신호 — 단독으로는 졸음 판정 안 함
        """
        if gaze_info is None:
            return "uncertain"

        # 졸음 조건 분해
        is_drowsy_ear  = avg_ear < EAR_DROWSY
        is_drowsy_head = (head_info is not None
                          and head_info["pitch"] > HEAD_PITCH_DROWSY)
        is_drowsy_shoulder = (
            posture_info is not None
            and posture_info.get("both_visible", False)
            and abs(posture_info["shoulder_tilt_ratio"]) > SHOULDER_TILT_DROWSY
        )
        # EAR 저하 + (고개 OR 어깨) 중 하나라도 이상하면 졸음
        if is_drowsy_ear and (is_drowsy_head or is_drowsy_shoulder):
            return "drowsy"

        # 집중 조건
        gaze_ok = (abs(gaze_info["yaw_ratio"])   < GAZE_YAW_THRESH
                   and abs(gaze_info["pitch_ratio"]) < GAZE_PITCH_THRESH)
        head_ok = (head_info is None  # 고개 미감지 → 조건 면제
                   or (abs(head_info["pitch"]) < HEAD_PITCH_THRESH
                       and abs(head_info["yaw"])   < HEAD_YAW_THRESH))
        shoulder_ok = (
            posture_info is None                          # 미감지 → 조건 면제
            or not posture_info.get("both_visible", False)
            or abs(posture_info["shoulder_tilt_ratio"]) < SHOULDER_TILT_THRESH
        )

        return "focused" if (gaze_ok and head_ok and shoulder_ok) else "distracted"

    # ── 상태 전환 ─────────────────────────────────────────────────────────────

    def _update_status(self, candidate: str) -> tuple[str, float]:
        """
        candidate가 연속으로 CONFIRM_FRAMES 이상 이어지면 status 전환.
        Returns (current_status, confirm_ratio)
        """
        if candidate == self._candidate:
            self._confirm_count += 1
        else:
            self._candidate = candidate
            self._confirm_count = 1

        threshold = CONFIRM_FRAMES[candidate]
        ratio = _clamp(self._confirm_count / threshold, 0.0, 1.0)

        if self._confirm_count >= threshold:
            self._status = candidate

        return self._status, ratio

    # ── 퍼블릭 API ───────────────────────────────────────────────────────────

    def update(self,
               gaze_info:    Optional[dict],
               head_info:    Optional[dict],
               posture_info: Optional[dict] = None) -> ScoreResult:
        """
        매 프레임 호출.
        gaze_info    : gaze_estimator.estimate_gaze() 결과
        head_info    : gaze_estimator.estimate_head_pose() 결과
        posture_info : gaze_estimator.analyze_posture() 결과
        """
        focus_score, gaze_score, head_score, shoulder_score = \
            self._calc_focus(gaze_info, head_info, posture_info)
        fatigue_score, avg_ear = self._calc_fatigue(gaze_info)
        candidate              = self._classify(gaze_info, head_info, posture_info, avg_ear)
        status, confirm_ratio  = self._update_status(candidate)

        return ScoreResult(
            focus_score    = focus_score,
            fatigue_score  = fatigue_score,
            status         = status,
            candidate      = candidate,
            confirm_ratio  = confirm_ratio,
            gaze_score     = gaze_score,
            head_score     = head_score,
            shoulder_score = shoulder_score,
            avg_ear        = avg_ear,
        )

    def reset(self):
        self._status        = "uncertain"
        self._candidate     = "uncertain"
        self._confirm_count = 0
