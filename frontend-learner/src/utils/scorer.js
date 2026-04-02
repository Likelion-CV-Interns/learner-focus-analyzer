/**
 * FocusScorer — scorer.py의 JS 포팅
 * 매 프레임 gaze/EAR/head 결과를 받아 focus_score, fatigue_score, status를 반환
 */

const GAZE_YAW_THRESH    = 0.25;
const GAZE_PITCH_THRESH  = 0.25;
const HEAD_PITCH_THRESH  = 12.0;
const HEAD_YAW_THRESH    = 18.0;
const EAR_NORMAL         = 0.28;  // 캘리브레이션 전 기본값
const EAR_DROWSY         = 0.20;
const EAR_DROWSY_DELTA   = 0.08;  // 캘리브레이션 후: 기준 EAR - 이 값 = 졸음 임계
const HEAD_PITCH_DROWSY  = 15.0;
const GAZE_WEIGHT        = 0.60;
const HEAD_WEIGHT        = 0.40;
const FOCUS_THRESH       = 0.55;
const DISTRACT_THRESH    = 0.35;
const EAR_EMA_ALPHA      = 0.005;
const FOCUS_EMA_ALPHA    = 0.05;

const CONFIRM_FRAMES = {
  focused:    20,
  distracted: 25,
  drowsy:     20,
  focusing:   15,
  uncertain:  10,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function linearScore(value, threshold) { return clamp(1.0 - Math.abs(value) / threshold, 0, 1); }

export class FocusScorer {
  constructor() {
    this._status        = 'uncertain';
    this._candidate     = 'uncertain';
    this._confirmCount  = 0;
    this._earEma        = null;
    this._focusEma      = 0.5;
    // 캘리브레이션 오프셋 (calibrate() 호출 전까지 0/기본값)
    this._gazeYawOffset   = 0;
    this._gazePitchOffset = 0;
    this._headPitchOffset = 0;
    this._headYawOffset   = 0;
    this._earNormal       = EAR_NORMAL;
    this._earDrowsy       = EAR_DROWSY;
  }

  /**
   * 캘리브레이션 결과 적용
   * @param {{ gazeYaw, gazePitch, headPitch, headYaw, ear }} offsets
   */
  calibrate({ gazeYaw, gazePitch, headPitch, headYaw, ear }) {
    this._gazeYawOffset   = gazeYaw;
    this._gazePitchOffset = gazePitch;
    this._headPitchOffset = headPitch;
    this._headYawOffset   = headYaw;
    // 개인 EAR 기준선 적용 (최솟값 0.23 보장)
    this._earNormal = Math.max(0.23, ear);
    this._earDrowsy = this._earNormal - EAR_DROWSY_DELTA;
    this._earEma    = ear;  // EMA를 기준선으로 초기화
  }

  update(gaze, ear, head) {
    // ── 캘리브레이션 오프셋 적용 ─────────────────────────────────────────────
    const adjGaze = gaze ? {
      yaw_ratio:   gaze.yaw_ratio   - this._gazeYawOffset,
      pitch_ratio: gaze.pitch_ratio - this._gazePitchOffset,
    } : null;
    const adjHead = head ? {
      pitch: head.pitch - this._headPitchOffset,
      yaw:   head.yaw   - this._headYawOffset,
    } : null;

    // ── 집중도 계산 ──────────────────────────────────────────────────────────
    let rawFocus = 0, gazeScore = 0, headScore = 0;
    if (adjGaze) {
      gazeScore = Math.min(
        linearScore(adjGaze.yaw_ratio,   GAZE_YAW_THRESH),
        linearScore(adjGaze.pitch_ratio, GAZE_PITCH_THRESH),
      );
      headScore = adjHead
        ? Math.min(linearScore(adjHead.pitch, HEAD_PITCH_THRESH), linearScore(adjHead.yaw, HEAD_YAW_THRESH))
        : 0.5;
      rawFocus = clamp(gazeScore * GAZE_WEIGHT + headScore * HEAD_WEIGHT, 0, 1);
    }

    // ── 피로도 계산 (EAR EMA) ────────────────────────────────────────────────
    let avgEar = ear?.avg ?? this._earNormal;
    if (this._earEma === null) this._earEma = avgEar;
    else this._earEma = (1 - EAR_EMA_ALPHA) * this._earEma + EAR_EMA_ALPHA * avgEar;
    const earRange = this._earNormal - this._earDrowsy;
    const fatigueScore = clamp(
      1.0 - (this._earEma - this._earDrowsy) / earRange, 0, 1
    );

    // ── 집중도 EMA smoothing ─────────────────────────────────────────────────
    this._focusEma = (1 - FOCUS_EMA_ALPHA) * this._focusEma + FOCUS_EMA_ALPHA * rawFocus;
    const focusScore = this._focusEma;

    // ── 상태 분류 ────────────────────────────────────────────────────────────
    let candidate = 'uncertain';
    if (adjGaze) {
      const isDrowsyEar  = avgEar < this._earDrowsy;
      const isDrowsyHead = adjHead && adjHead.pitch > HEAD_PITCH_DROWSY;
      if (isDrowsyEar && isDrowsyHead) {
        candidate = 'drowsy';
      } else if (focusScore >= FOCUS_THRESH) {
        candidate = 'focused';
      } else if (focusScore < DISTRACT_THRESH) {
        candidate = 'distracted';
      } else {
        candidate = 'focusing';
      }
    }

    // ── 상태 전환 확인 ───────────────────────────────────────────────────────
    if (candidate === this._candidate) {
      this._confirmCount++;
    } else {
      this._candidate    = candidate;
      this._confirmCount = 1;
    }
    if (this._confirmCount >= CONFIRM_FRAMES[candidate]) {
      this._status = candidate;
    }

    return {
      focus_score:   focusScore,
      fatigue_score: fatigueScore,
      avg_ear:       avgEar,
      status:        this._status,
      gaze_yaw:      adjGaze?.yaw_ratio   ?? 0,
      gaze_pitch:    adjGaze?.pitch_ratio ?? 0,
      head_pitch:    adjHead?.pitch       ?? 0,
      head_yaw:      adjHead?.yaw         ?? 0,
    };
  }

  reset() {
    this._status       = 'uncertain';
    this._candidate    = 'uncertain';
    this._confirmCount = 0;
    this._earEma       = null;
    this._focusEma     = 0.5;
  }
}
