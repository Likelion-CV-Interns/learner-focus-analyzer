/**
 * MediaPipe Tasks Vision 기반 얼굴 감지 유틸리티
 * - 시선 (gaze yaw/pitch)
 * - 눈 종횡비 (EAR)
 * - 머리 방향 (head pitch/yaw) — 변환 행렬 기반
 * - 감정 (blendshapes → 분류)
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// ── 랜드마크 인덱스 ────────────────────────────────────────────────────────────
const L_EYE   = { p1: 33,  p2: 160, p3: 158, p4: 133, p5: 153, p6: 144 };
const R_EYE   = { p1: 362, p2: 387, p3: 385, p4: 263, p5: 380, p6: 373 };
const L_IRIS  = 468;
const R_IRIS  = 473;
const L_OUTER = 33;   // left eye outer corner
const L_INNER = 133;  // left eye inner corner
const R_INNER = 362;  // right eye inner corner
const R_OUTER = 263;  // right eye outer corner


// ── 초기화 ────────────────────────────────────────────────────────────────────
let faceLandmarker = null;

export async function initDetector() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode:                      'VIDEO',
    numFaces:                         1,
    outputFaceBlendshapes:            true,
    outputFacialTransformationMatrixes: true,
  });
}

export function isDetectorReady() {
  return faceLandmarker !== null;
}

// ── 메인 감지 함수 ────────────────────────────────────────────────────────────
export function detect(videoEl, timestampMs) {
  if (!faceLandmarker) return null;
  const result = faceLandmarker.detectForVideo(videoEl, timestampMs);
  if (!result.faceLandmarks?.length) return null;

  const lm         = result.faceLandmarks[0];
  const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
  const matrix      = result.facialTransformationMatrixes?.[0]?.data ?? null;

  const ear       = calcEAR(lm);
  const gaze      = calcGaze(lm);
  const head      = calcHeadPose(matrix);
  const emotion   = classifyEmotion(blendshapes);

  return { ear, gaze, head, emotion };
}

// ── EAR (Eye Aspect Ratio) ────────────────────────────────────────────────────
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAR(lm, idx) {
  const { p1, p2, p3, p4, p5, p6 } = idx;
  return (dist(lm[p2], lm[p6]) + dist(lm[p3], lm[p5])) / (2 * dist(lm[p1], lm[p4]));
}

function calcEAR(lm) {
  const left  = eyeAR(lm, L_EYE);
  const right = eyeAR(lm, R_EYE);
  return { left, right, avg: (left + right) / 2 };
}

// ── 시선 (Gaze) ───────────────────────────────────────────────────────────────
function calcGaze(lm) {
  // 각 눈에서 iris가 eye corner 사이 어디에 있는지 정규화
  const lEyeW = Math.abs(lm[L_INNER].x - lm[L_OUTER].x);
  const rEyeW = Math.abs(lm[R_OUTER].x - lm[R_INNER].x);

  const lGazeX = lEyeW > 0 ? ((lm[L_IRIS].x - lm[L_OUTER].x) / lEyeW - 0.5) * 2 : 0;
  const rGazeX = rEyeW > 0 ? ((lm[R_IRIS].x - lm[R_INNER].x) / rEyeW - 0.5) * 2 : 0;

  const lEyeH = Math.abs(lm[L_EYE.p2].y - lm[L_EYE.p6].y);
  const rEyeH = Math.abs(lm[R_EYE.p2].y - lm[R_EYE.p6].y);
  const eyeH  = (lEyeH + rEyeH) / 2;

  const lGazeY = eyeH > 0 ? (lm[L_IRIS].y - (lm[L_EYE.p2].y + lm[L_EYE.p6].y) / 2) / eyeH : 0;
  const rGazeY = eyeH > 0 ? (lm[R_IRIS].y - (lm[R_EYE.p2].y + lm[R_EYE.p6].y) / 2) / eyeH : 0;

  return {
    yaw_ratio:   (lGazeX + rGazeX) / 2,
    pitch_ratio: (lGazeY + rGazeY) / 2,
  };
}

// ── 머리 방향 (Head Pose) ─────────────────────────────────────────────────────
// MediaPipe column-major 4x4 변환 행렬 → Euler 각도 (도)
function calcHeadPose(matrix) {
  if (!matrix) return { pitch: 0, yaw: 0 };
  // column-major: m[col*4 + row]
  // R[row][col] = matrix[col*4 + row]
  const r21 = matrix[6];   // R[2][1] = col1, row2
  const r22 = matrix[10];  // R[2][2]
  const r20 = matrix[2];   // R[2][0]
  const pitch = Math.atan2(-r21, r22) * (180 / Math.PI);
  const yaw   = Math.asin(Math.max(-1, Math.min(1, r20))) * (180 / Math.PI);
  return { pitch, yaw };
}

// ── 감정 분류 (Blendshapes) ──────────────────────────────────────────────────
function getBS(blendshapes, name) {
  const cat = blendshapes.find(b => b.categoryName === name);
  return cat ? cat.score : 0;
}

function classifyEmotion(blendshapes) {
  if (!blendshapes.length) return 'neutral';

  const smile   = (getBS(blendshapes, 'mouthSmileLeft') + getBS(blendshapes, 'mouthSmileRight')) / 2;
  const browUp  = (getBS(blendshapes, 'browInnerUp') +
                   getBS(blendshapes, 'browOuterUpLeft') +
                   getBS(blendshapes, 'browOuterUpRight')) / 3;
  const jawOpen = getBS(blendshapes, 'jawOpen');
  const blink   = (getBS(blendshapes, 'eyeBlinkLeft') + getBS(blendshapes, 'eyeBlinkRight')) / 2;
  const frown   = (getBS(blendshapes, 'browDownLeft') + getBS(blendshapes, 'browDownRight')) / 2;
  const squint  = (getBS(blendshapes, 'eyeSquintLeft') + getBS(blendshapes, 'eyeSquintRight')) / 2;

  // 명확한 표정 신호가 있을 때만 분류, 나머지는 neutral
  // amused: 뚜렷한 미소
  if (smile > 0.50) return 'amused';
  // surprise: 입 열림 + 눈썹 올림
  if (jawOpen > 0.40 && browUp > 0.28) return 'surprise';
  // confusion: 눈썹 내림 + 눈 좁힘 (찡그림)
  if (frown > 0.30 && squint > 0.35) return 'confusion';
  // boredom: 눈 많이 깜빡임 + 무표정 (눈 감기는 중)
  if (blink > 0.60 && smile < 0.15 && jawOpen < 0.10) return 'boredom';
  // engagement: 눈썹 올림 (주의 집중 표정) + 입 닫힘 + 미소 아님
  if (browUp > 0.32 && smile < 0.25 && jawOpen < 0.15) return 'engagement';

  return 'neutral';
}
