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

import time
from collections import deque
from dataclasses import dataclass
from typing import Optional


# ─── 임계값 상수 ──────────────────────────────────────────────────────────────

# 시선 (gaze_ratio: -1 ~ +1)
GAZE_YAW_THRESH   = 0.25   # 좌우 ±25% 이내 → 화면 응시 (이전 0.30에서 엄격하게)
GAZE_PITCH_THRESH = 0.25   # 상하 ±25% 이내

# 고개 방향 (solvePnP 각도, 단위: 도)
HEAD_PITCH_THRESH = 12.0   # 고개 상하 ±12° 이내 (이전 15°에서 엄격하게)
HEAD_YAW_THRESH   = 18.0   # 고개 좌우 ±18° 이내

# 눈 종횡비 (EAR: Eye Aspect Ratio)
EAR_NORMAL = 0.28          # 정상적으로 눈을 뜬 상태
EAR_DROWSY = 0.20          # 이 미만이면 눈이 감기는 중

# 고개 숙임 (졸음 판단용)
HEAD_PITCH_DROWSY = 15.0

# 어깨 기울기 (score 보조 신호, status 판정에는 미사용)
SHOULDER_TILT_THRESH = 0.12

# 가중치 (합 = 1.0) — 어깨는 score 보조용으로만 사용
GAZE_WEIGHT     = 0.60
HEAD_WEIGHT     = 0.40

# status 전환 점수 임계값
FOCUS_THRESH      = 0.55   # focus_score ≥ 이 값 → "focused" 후보
DISTRACT_THRESH   = 0.35   # focus_score < 이 값 → "distracted" 후보
# 중간 구간(0.35~0.55)은 현재 status 유지

# 상태 전환 확인 프레임 수 (30fps 기준)
CONFIRM_FRAMES = {
    "focused":    20,   # ~0.67초 (이전보다 길게 — 순간 시선 이탈 무시)
    "distracted": 25,   # ~0.83초
    "drowsy":     20,   # ~0.67초
    "focusing":   15,   # ~0.50초 (집중 시작 중 — 중간 구간)
    "uncertain":  10,   # 얼굴 미감지
}

# ── EMA 스무딩 계수 ────────────────────────────────────────────────────────────
# 피로도 (EAR EMA): α 작을수록 느리게 반응 → 단발 깜빡임 무시
#   α=0.005 기준, 단발 깜빡임(2프레임) 영향 ≈ 1%  /  30초 저하 → 완전 반영
EAR_EMA_ALPHA   = 0.005

# 집중도 (focus EMA): α 클수록 빠르게 반응
#   α=0.05 기준, 시정수 ≈ 20프레임(0.67초) → 순간 노이즈 제거 + 빠른 반응
FOCUS_EMA_ALPHA = 0.05

# ── 피로도 추가 신호 ──────────────────────────────────────────────────────────

# 세션 경과 시간: 90분에서 최대 기여치(0.6)에 도달
TIME_FATIGUE_MAX_MIN   = 90.0   # 분
TIME_FATIGUE_MAX_VALUE = 0.60   # 90분 도달 시 time_fatigue 최댓값

# 시선 고착: 최근 N 프레임의 시선 표준편차가 이 값 이하면 고착으로 판정
GAZE_HISTORY_FRAMES     = 900   # 30fps × 30초
GAZE_STD_NORMAL         = 0.15  # 정상 시선 이동 표준편차 기준

# 미세 머리 움직임: 최근 N 프레임의 head yaw/pitch 표준편차
HEAD_HISTORY_FRAMES     = 900   # 30fps × 30초
HEAD_STD_NORMAL         = 5.0   # 정상 미세 머리 움직임 표준편차 (도)

# 피로도 가중치 합산 (합 = 1.0)
W_EAR        = 0.25
W_TIME       = 0.35
W_FIXATION   = 0.25
W_HEAD_MOTION = 0.15


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
        self._ear_ema: Optional[float] = None   # 첫 프레임 전까지 None
        self._focus_ema: float = 0.5            # 중립값으로 시작

        # 추가 피로도 신호
        self._session_start: float = time.time()
        self._gaze_yaw_hist:   deque = deque(maxlen=GAZE_HISTORY_FRAMES)
        self._gaze_pitch_hist: deque = deque(maxlen=GAZE_HISTORY_FRAMES)
        self._head_yaw_hist:   deque = deque(maxlen=HEAD_HISTORY_FRAMES)
        self._head_pitch_hist: deque = deque(maxlen=HEAD_HISTORY_FRAMES)

    # ── 점수 계산 ──────────────────────────────────────────────────────────────

    @staticmethod
    def _calc_focus(gaze_info:    Optional[dict],
                    head_info:    Optional[dict],
                    posture_info: Optional[dict]) -> tuple[float, float, float, float]:
        """
        Returns (raw_focus, gaze_score, head_score, shoulder_score)  모두 0.0~1.0

        gaze_score : min(yaw_score, pitch_score) — 둘 중 나쁜 쪽이 전체를 결정
        head_score : min(pitch_score, yaw_score) — 동일
        어깨       : 보조 페널티로만 사용 (status 판정에는 미관여)
        """
        if gaze_info is None:
            return 0.0, 0.0, 0.0, 0.0

        # 시선: min 방식 — 하나라도 범위를 벗어나면 점수 하락
        gaze_score = min(
            _linear_score(gaze_info["yaw_ratio"],   GAZE_YAW_THRESH),
            _linear_score(gaze_info["pitch_ratio"], GAZE_PITCH_THRESH),
        )

        # 고개: min 방식
        if head_info is not None:
            head_score = min(
                _linear_score(head_info["pitch"], HEAD_PITCH_THRESH),
                _linear_score(head_info["yaw"],   HEAD_YAW_THRESH),
            )
        else:
            head_score = 0.5   # 고개 미감지 → 중립

        # 어깨: 보조 페널티 (기울어지면 score를 최대 10% 감점)
        if posture_info is not None and posture_info.get("both_visible"):
            shoulder_score = _linear_score(
                posture_info["shoulder_tilt_ratio"], SHOULDER_TILT_THRESH
            )
        else:
            shoulder_score = 1.0   # 미감지 → 페널티 없음

        raw_focus = _clamp(
            gaze_score * GAZE_WEIGHT
            + head_score * HEAD_WEIGHT
            - (1.0 - shoulder_score) * 0.10,   # 어깨 기울기 페널티 (최대 -0.10)
            0.0, 1.0
        )
        return raw_focus, gaze_score, head_score, shoulder_score

    @staticmethod
    def _std(values: deque) -> float:
        """deque의 표준편차 (numpy 없이)"""
        n = len(values)
        if n < 2:
            return 0.0
        mean = sum(values) / n
        return (sum((x - mean) ** 2 for x in values) / n) ** 0.5

    def _calc_fatigue(self, gaze_info: Optional[dict],
                      head_info: Optional[dict]) -> tuple[float, float]:
        """
        Returns (fatigue_score, avg_ear)

        4가지 신호를 가중 합산:
          1. ear_fatigue     : EAR EMA (눈 감김 누적)
          2. time_fatigue    : 세션 경과 시간 (90분 → 최대 0.6)
          3. fixation_fatigue: 시선 고착 (시선 표준편차 저하)
          4. head_motion_fat : 미세 머리 움직임 감소
        """
        # ── 1. EAR 피로도 (기존 로직) ──
        if gaze_info is None:
            ear_fatigue = _clamp(1.0 - ((self._ear_ema or EAR_NORMAL) - EAR_DROWSY)
                                 / (EAR_NORMAL - EAR_DROWSY), 0.0, 1.0)
            avg_ear = 0.0
        else:
            avg_ear = (gaze_info["left_ear"] + gaze_info["right_ear"]) / 2.0
            if self._ear_ema is None:
                self._ear_ema = avg_ear
            else:
                self._ear_ema = (1 - EAR_EMA_ALPHA) * self._ear_ema + EAR_EMA_ALPHA * avg_ear
            span = EAR_NORMAL - EAR_DROWSY
            ear_fatigue = _clamp(1.0 - (self._ear_ema - EAR_DROWSY) / span, 0.0, 1.0)

        # ── 2. 세션 경과 시간 피로도 ──
        elapsed_min = (time.time() - self._session_start) / 60.0
        time_fatigue = _clamp(
            (elapsed_min / TIME_FATIGUE_MAX_MIN) * TIME_FATIGUE_MAX_VALUE,
            0.0, TIME_FATIGUE_MAX_VALUE,
        )

        # ── 3. 시선 고착 피로도 ──
        if gaze_info is not None:
            self._gaze_yaw_hist.append(gaze_info["yaw_ratio"])
            self._gaze_pitch_hist.append(gaze_info["pitch_ratio"])

        if len(self._gaze_yaw_hist) >= 30:
            gaze_std = (self._std(self._gaze_yaw_hist) + self._std(self._gaze_pitch_hist)) / 2.0
            fixation_fatigue = _clamp(1.0 - gaze_std / GAZE_STD_NORMAL, 0.0, 1.0)
        else:
            fixation_fatigue = 0.0   # 데이터 부족 시 미적용

        # ── 4. 미세 머리 움직임 감소 피로도 ──
        if head_info is not None:
            self._head_yaw_hist.append(head_info["yaw"])
            self._head_pitch_hist.append(head_info["pitch"])

        if len(self._head_yaw_hist) >= 30:
            head_std = (self._std(self._head_yaw_hist) + self._std(self._head_pitch_hist)) / 2.0
            head_motion_fatigue = _clamp(1.0 - head_std / HEAD_STD_NORMAL, 0.0, 1.0)
        else:
            head_motion_fatigue = 0.0   # 데이터 부족 시 미적용

        fatigue = _clamp(
            W_EAR         * ear_fatigue
            + W_TIME      * time_fatigue
            + W_FIXATION  * fixation_fatigue
            + W_HEAD_MOTION * head_motion_fatigue,
            0.0, 1.0,
        )
        return fatigue, avg_ear

    # ── 상태 분류 ─────────────────────────────────────────────────────────────

    @staticmethod
    def _classify(gaze_info: Optional[dict],
                  head_info: Optional[dict],
                  avg_ear:   float,
                  focus_ema: float) -> str:
        """
        focus_score(EMA) 기반으로 상태를 결정한다.
        score와 status가 일치하도록 통일.

        우선순위: uncertain > drowsy > focused/distracted

        졸음: EAR 저하 + 고개 숙임 (EMA가 아닌 현재 프레임 raw 값으로 즉시 감지)
        집중/미집중: focus_ema 임계값 기준
        중간 구간: "uncertain" → CONFIRM_FRAMES가 짧아 현재 status 유지에 가까움
        """
        if gaze_info is None:
            return "uncertain"

        # 졸음: 즉각 반응이 필요하므로 EMA 아닌 현재 EAR 사용
        is_drowsy_ear  = avg_ear < EAR_DROWSY
        is_drowsy_head = (head_info is not None
                          and head_info["pitch"] > HEAD_PITCH_DROWSY)
        if is_drowsy_ear and is_drowsy_head:
            return "drowsy"

        # 집중/미집중: EMA 기반 (순간 노이즈 무시)
        if focus_ema >= FOCUS_THRESH:
            return "focused"
        elif focus_ema < DISTRACT_THRESH:
            return "distracted"
        else:
            # 중간 구간(0.35~0.55): 측정은 되지만 집중으로 전환 중
            return "focusing"

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
        raw_focus, gaze_score, head_score, shoulder_score = \
            self._calc_focus(gaze_info, head_info, posture_info)
        fatigue_score, avg_ear = self._calc_fatigue(gaze_info, head_info)

        # 집중도 EMA smoothing (순간 노이즈 제거)
        self._focus_ema = ((1 - FOCUS_EMA_ALPHA) * self._focus_ema
                           + FOCUS_EMA_ALPHA * raw_focus)
        focus_score = self._focus_ema

        candidate             = self._classify(gaze_info, head_info, avg_ear, focus_score)
        status, confirm_ratio = self._update_status(candidate)

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
        self._ear_ema       = None
        self._focus_ema     = 0.5
        self._session_start = time.time()
        self._gaze_yaw_hist.clear()
        self._gaze_pitch_hist.clear()
        self._head_yaw_hist.clear()
        self._head_pitch_hist.clear()
