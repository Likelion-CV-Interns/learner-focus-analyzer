/**
 * FocusScorer — scorer.py의 JS 포팅
 * 매 프레임 gaze/EAR/head 결과를 받아 focus_score, fatigue_score, status를 반환
 */

const GAZE_YAW_THRESH    = 0.25;
const GAZE_PITCH_THRESH  = 0.25;
const HEAD_PITCH_THRESH  = 12.0;
const HEAD_YAW_THRESH    = 18.0;
const EAR_NORMAL         = 0.28;
const EAR_DROWSY         = 0.20;
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
  }

  update(gaze, ear, head) {
    // ── 집중도 계산 ──────────────────────────────────────────────────────────
    let rawFocus = 0, gazeScore = 0, headScore = 0;
    if (gaze) {
      gazeScore = Math.min(
        linearScore(gaze.yaw_ratio,   GAZE_YAW_THRESH),
        linearScore(gaze.pitch_ratio, GAZE_PITCH_THRESH),
      );
      headScore = head
        ? Math.min(linearScore(head.pitch, HEAD_PITCH_THRESH), linearScore(head.yaw, HEAD_YAW_THRESH))
        : 0.5;
      rawFocus = clamp(gazeScore * GAZE_WEIGHT + headScore * HEAD_WEIGHT, 0, 1);
    }

    // ── 피로도 계산 (EAR EMA) ────────────────────────────────────────────────
    let avgEar = ear?.avg ?? EAR_NORMAL;
    if (this._earEma === null) this._earEma = avgEar;
    else this._earEma = (1 - EAR_EMA_ALPHA) * this._earEma + EAR_EMA_ALPHA * avgEar;
    const fatigueScore = clamp(
      1.0 - (this._earEma - EAR_DROWSY) / (EAR_NORMAL - EAR_DROWSY), 0, 1
    );

    // ── 집중도 EMA smoothing ─────────────────────────────────────────────────
    this._focusEma = (1 - FOCUS_EMA_ALPHA) * this._focusEma + FOCUS_EMA_ALPHA * rawFocus;
    const focusScore = this._focusEma;

    // ── 상태 분류 ────────────────────────────────────────────────────────────
    let candidate = 'uncertain';
    if (gaze) {
      const isDrowsyEar  = avgEar < EAR_DROWSY;
      const isDrowsyHead = head && head.pitch > HEAD_PITCH_DROWSY;
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
      gaze_yaw:      gaze?.yaw_ratio   ?? 0,
      gaze_pitch:    gaze?.pitch_ratio ?? 0,
      head_pitch:    head?.pitch       ?? 0,
      head_yaw:      head?.yaw         ?? 0,
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
