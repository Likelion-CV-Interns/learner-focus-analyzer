"""
Real-Time Gaze / Head Pose / Shoulder Angle Detector
------------------------------------------------------
MediaPipe Holistic으로 다음 세 가지를 실시간 탐지한다.

  1. 시선(Gaze)    : iris 위치 → yaw/pitch 편향 비율
  2. 머리(Head)    : solvePnP  → pitch / yaw / roll (도)
  3. 어깨(Shoulder): 어깨 두 점 → 기울기 비율 / 각도 (도)


실행:
    python main.py

의존:
    pip install mediapipe opencv-python numpy pillow

    Python 3.9+ / mediapipe 0.10.x 호환
    (mediapipe 0.10.x에서 mp.solutions.holistic은 deprecated지만 작동함)

단축키:
    q / ESC : 종료
    c       : 시선 캘리브레이션 재시작
    s       : 스크린샷 저장
"""

import warnings
warnings.filterwarnings("ignore", category=UserWarning)   # mediapipe deprecated 경고 억제

import cv2
import mediapipe as mp
import numpy as np
import time
from collections import deque

from PIL import Image, ImageDraw, ImageFont

from gaze_estimator import (
    estimate_gaze,
    estimate_head_pose,
    analyze_posture,
    GazeSmoother,
    HeadPoseSmoother,
    PostureSmoother,
    GazeCalibrator,
    LEFT_IRIS,
    RIGHT_IRIS,
)
from scorer import FocusScorer
from ws_sender import WSSender
from colab_sender import ColabSender

# ─── 설정 ────────────────────────────────────────────────────────────────────

CAM_INDEX      = 0
TARGET_FPS     = 30
SHOW_LANDMARKS = True
SHOW_GAZE_GRAPH = True

# ─── WebSocket 설정 ───────────────────────────────────────────────────────────
# 서버가 없으면 WS_ENABLED = False 로 두면 됩니다.
WS_ENABLED   = True
WS_SERVER    = "ws://localhost:8000"
WS_SESSION   = "sess_abc123"   # 어떤 세션에 데이터를 보낼지
WS_USER_ID   = "cam1"          # 이 PC의 식별자 (여러 PC 구분)
WS_SEND_INTERVAL = 0.1         # 전송 간격 (초)

# ─── Colab 설정 ───────────────────────────────────────────────────────────────
# Colab에서 ngrok URL이 출력되면 아래에 붙여넣기
# 서버가 없으면 COLAB_ENABLED = False 로 두면 됩니다.
COLAB_ENABLED  = False
COLAB_URL      = "https://xxxx-xxxx.ngrok.io"  # Colab 실행 후 출력된 URL
COLAB_INTERVAL = 1.0   # 프레임 전송 간격 (초). 모델이 무거우면 늘리기

# 색상 (BGR)
C_GREEN  = (50,  220, 50)
C_RED    = (50,  50,  220)
C_YELLOW = (0,   200, 255)
C_CYAN   = (220, 200, 50)
C_GRAY   = (180, 180, 180)
C_WHITE  = (255, 255, 255)
C_BLACK  = (0,   0,   0)
C_BG     = (20,  20,  20)

FONT = cv2.FONT_HERSHEY_SIMPLEX

KO_FONT_PATH  = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
_ko_font_cache: dict = {}


# ─── 한국어 텍스트 렌더링 ─────────────────────────────────────────────────────

def _ko_font(size: int) -> ImageFont.FreeTypeFont:
    if size not in _ko_font_cache:
        try:
            _ko_font_cache[size] = ImageFont.truetype(KO_FONT_PATH, size)
        except Exception:
            _ko_font_cache[size] = ImageFont.load_default()
    return _ko_font_cache[size]


def put_ko_text(img, text: str, pos: tuple, size: int, color_bgr: tuple):
    pil  = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil)
    b, g, r = color_bgr
    draw.text(pos, text, font=_ko_font(size), fill=(r, g, b))
    img[:] = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


# ─── 그리기 헬퍼 ─────────────────────────────────────────────────────────────

def txt(img, text: str, org: tuple,
        scale: float = 0.55, thick: int = 1,
        fg=C_WHITE, bg=C_BG, pad: int = 4):
    (tw, th), bl = cv2.getTextSize(text, FONT, scale, thick)
    x, y = org
    cv2.rectangle(img, (x - pad, y - th - pad), (x + tw + pad, y + bl + pad), bg, -1)
    cv2.putText(img, text, (x, y), FONT, scale, fg, thick, cv2.LINE_AA)


def draw_iris(img, lms, iris_indices, img_w, img_h, color):
    pts = []
    for idx in iris_indices:
        lm = lms[idx]
        px, py = int(lm.x * img_w), int(lm.y * img_h)
        pts.append((px, py))
        cv2.circle(img, (px, py), 2, color, -1)
    cx, cy = pts[0]
    rx, ry = pts[2]
    cv2.circle(img, (cx, cy), max(1, int(np.hypot(rx - cx, ry - cy))), color, 1)


def draw_shoulder_line(img, posture_info):
    if posture_info is None or not posture_info["both_visible"]:
        return
    lp = tuple(posture_info["left_pt"].astype(int))
    rp = tuple(posture_info["right_pt"].astype(int))
    ok = abs(posture_info["shoulder_tilt_ratio"]) < 0.12
    c  = C_GREEN if ok else C_RED
    cv2.line(img, lp, rp, c, 2)
    cv2.circle(img, lp, 6, c, -1)
    cv2.circle(img, rp, 6, c, -1)


def draw_head_axis(img, head_info, img_w, img_h):
    """코끝에서 머리 방향 축을 그린다."""
    if head_info is None:
        return
    nose  = head_info["nose_tip"]
    rvec  = head_info["rot_vec"]
    tvec  = head_info["trans_vec"]
    cmat  = head_info["cam_mat"]
    dist  = np.zeros((4, 1), dtype=np.float64)
    length = 60.0
    axes_3d = np.float32([
        [length, 0,      0],   # X → 오른쪽 (빨강)
        [0,      length, 0],   # Y → 아래   (초록)
        [0,      0,     -length],  # Z → 앞   (파랑)
    ])
    pts, _ = cv2.projectPoints(axes_3d, rvec, tvec, cmat, dist)
    p = [tuple(p.ravel().astype(int)) for p in pts]
    cv2.arrowedLine(img, nose, p[0], (50,  50,  220), 2, tipLength=0.3)  # X 빨강
    cv2.arrowedLine(img, nose, p[1], (50,  220, 50),  2, tipLength=0.3)  # Y 초록
    cv2.arrowedLine(img, nose, p[2], (220, 50,  50),  2, tipLength=0.3)  # Z 파랑


def draw_gaze_graph(img, yaw_hist, pitch_hist, x0, y0, w=150, h=150):
    cv2.rectangle(img, (x0, y0), (x0 + w, y0 + h), (30, 30, 30), -1)
    cv2.rectangle(img, (x0, y0), (x0 + w, y0 + h), C_GRAY, 1)
    cx, cy = x0 + w // 2, y0 + h // 2
    cv2.line(img, (cx, y0), (cx, y0 + h), (60, 60, 60), 1)
    cv2.line(img, (x0, cy), (x0 + w, cy), (60, 60, 60), 1)
    # 집중 범위 박스 (편의상 ±0.3)
    bx = int(0.30 * (w / 2))
    by = int(0.30 * (h / 2))
    cv2.rectangle(img, (cx - bx, cy - by), (cx + bx, cy + by), (60, 120, 60), 1)
    for i in range(1, len(yaw_hist)):
        p1 = (cx + int(yaw_hist[i-1] * (w/2)), cy + int(pitch_hist[i-1] * (h/2)))
        p2 = (cx + int(yaw_hist[i]   * (w/2)), cy + int(pitch_hist[i]   * (h/2)))
        c  = int((i / len(yaw_hist)) * 200)
        cv2.line(img, p1, p2, (c, c, c), 1)
    if yaw_hist:
        px = cx + int(np.clip(yaw_hist[-1],   -1, 1) * (w / 2))
        py = cy + int(np.clip(pitch_hist[-1], -1, 1) * (h / 2))
        cv2.circle(img, (px, py), 5, C_GREEN, -1)
    txt(img, "GAZE", (x0 + 4, y0 + 14), scale=0.38, fg=C_GRAY, bg=(30, 30, 30))


# ─── 캘리브레이션 오버레이 ───────────────────────────────────────────────────

def draw_calibration_overlay(img, progress: float):
    h, w = img.shape[:2]
    bar_w = 300
    bx = w // 2 - bar_w // 2
    by = h // 2 + 30
    cv2.rectangle(img, (bx, by), (bx + bar_w, by + 16), (40, 40, 40), -1)
    cv2.rectangle(img, (bx, by), (bx + int(bar_w * progress), by + 16), C_GREEN, -1)
    cv2.rectangle(img, (bx, by), (bx + bar_w, by + 16), C_GRAY, 1)
    put_ko_text(img, "화면을 정면으로 바라봐 주세요",
                (w // 2 - 140, h // 2 - 24), 26, C_WHITE)
    put_ko_text(img, f"시선 캘리브레이션 중...  {int(progress * 100)}%",
                (bx, by + 24), 17, C_GRAY)


# ─── 메인 루프 ───────────────────────────────────────────────────────────────

def main():
    # mediapipe 0.10.x: mp.solutions.holistic은 deprecated지만 작동
    holistic = mp.solutions.holistic.Holistic(
        model_complexity=1,
        refine_face_landmarks=True,   # iris 478-point 활성화
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(CAM_INDEX)
    if not cap.isOpened():
        print(f"[ERROR] 웹캠(index={CAM_INDEX})을 열 수 없습니다.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)

    gaze_smoother    = GazeSmoother()
    head_smoother    = HeadPoseSmoother()
    posture_smoother = PostureSmoother()
    calibrator       = GazeCalibrator()
    scorer           = FocusScorer()

    yaw_hist   = deque(maxlen=60)
    pitch_hist = deque(maxlen=60)

    prev_time    = time.time()
    last_ws_send = 0.0

    # WebSocket sender 초기화
    ws_sender = None
    if WS_ENABLED:
        ws_url = f"{WS_SERVER}/ws/client/{WS_SESSION}/{WS_USER_ID}"
        ws_sender = WSSender(ws_url)
        print(f"[WS] 전송 대상: {ws_url}")

    # Colab sender 초기화
    colab_sender = None
    if COLAB_ENABLED:
        colab_sender = ColabSender(COLAB_URL, interval=COLAB_INTERVAL)
        print(f"[Colab] 전송 대상: {COLAB_URL}")

    print("=== Gaze / Head / Shoulder Detector ===")
    print("  q / ESC : 종료")
    print("  c       : 시선 캘리브레이션 재시작")
    print("  s       : 스크린샷 저장")
    print("========================================")

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        frame = cv2.flip(frame, 1)
        img_h, img_w = frame.shape[:2]

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = holistic.process(rgb)
        rgb.flags.writeable = True

        gaze_info    = None
        head_info    = None
        posture_info = None

        # ── 1. 시선 추정 ──
        if results.face_landmarks:
            lms      = results.face_landmarks.landmark
            gaze_raw = estimate_gaze(lms, img_w, img_h)
            gaze_cal = calibrator.update_and_apply(gaze_raw)
            gaze_info = gaze_smoother.update(gaze_cal)

            # 2. 머리 방향
            head_raw  = estimate_head_pose(lms, img_w, img_h)
            head_info = head_smoother.update(head_raw)

        # ── 3. 어깨 자세 ──
        posture_raw  = analyze_posture(results.pose_landmarks, img_w, img_h)
        posture_info = posture_smoother.update(posture_raw)

        # ── 4. 스코어링 ──
        score = scorer.update(gaze_info, head_info, posture_info)

        # ── 5. Colab 프레임 전송 ──
        if colab_sender:
            colab_sender.push_frame(frame)

        # ── 6. WebSocket 전송 (WS_SEND_INTERVAL마다) ──
        now_ws = time.time()
        if ws_sender and now_ws - last_ws_send >= WS_SEND_INTERVAL:
            last_ws_send = now_ws
            payload = {
                "status":        score.status,
                "focus_score":   round(score.focus_score,   3),
                "fatigue_score": round(score.fatigue_score, 3),
                "avg_ear":       round(score.avg_ear,       3),
                "gaze_yaw":      round(gaze_info["yaw_ratio"],   3) if gaze_info else 0.0,
                "gaze_pitch":    round(gaze_info["pitch_ratio"], 3) if gaze_info else 0.0,
                "head_pitch":    round(head_info["pitch"],  2) if head_info else 0.0,
                "head_yaw":      round(head_info["yaw"],    2) if head_info else 0.0,
            }
            # Colab 모델 결과 병합 (expression, phone_detected 등)
            if colab_sender and colab_sender.result:
                payload.update(colab_sender.result)
            ws_sender.send(payload)


        # ── 시각화 ──
        if SHOW_LANDMARKS:
            if gaze_info and results.face_landmarks:
                lms = results.face_landmarks.landmark
                draw_iris(frame, lms, LEFT_IRIS,  img_w, img_h, C_CYAN)
                draw_iris(frame, lms, RIGHT_IRIS, img_w, img_h, C_CYAN)

            draw_head_axis(frame, head_info, img_w, img_h)
            draw_shoulder_line(frame, posture_info)

        # 시선 방향 화살표
        if gaze_info:
            cx, cy = img_w // 2, img_h // 2
            ex = cx + int(gaze_info["yaw_ratio"]   * 80)
            ey = cy + int(gaze_info["pitch_ratio"] * 80)
            cv2.arrowedLine(frame, (cx, cy), (ex, ey), C_CYAN, 2, tipLength=0.3)
            yaw_hist.append(gaze_info["yaw_ratio"])
            pitch_hist.append(gaze_info["pitch_ratio"])

        # ── 캘리브레이션 오버레이 ──
        if not calibrator.is_calibrated:
            draw_calibration_overlay(frame, calibrator.progress)

        # ── 상단 바 ──
        cv2.rectangle(frame, (0, 0), (img_w, 44), (20, 20, 20), -1)
        now = time.time()
        fps = 1.0 / max(now - prev_time, 1e-6)
        prev_time = now
        cv2.putText(frame, f"FPS {fps:.1f}", (img_w - 90, 30),
                    FONT, 0.55, C_GRAY, 1, cv2.LINE_AA)

        # WS 연결 상태 표시
        if ws_sender:
            ws_label = "WS ON" if ws_sender.connected else "WS..."
            ws_color = C_GREEN if ws_sender.connected else C_YELLOW
            cv2.putText(frame, ws_label, (img_w - 170, 30),
                        FONT, 0.45, ws_color, 1, cv2.LINE_AA)

        # Colab 연결 상태 표시
        if colab_sender:
            colab_label = "COLAB ON" if colab_sender.connected else "COLAB..."
            colab_color = C_GREEN if colab_sender.connected else C_YELLOW
            cv2.putText(frame, colab_label, (img_w - 270, 30),
                        FONT, 0.45, colab_color, 1, cv2.LINE_AA)

        # 상태별 색상
        STATUS_COLOR = {
            "focused":    C_GREEN,
            "distracted": C_YELLOW,
            "drowsy":     C_RED,
            "uncertain":  C_GRAY,
        }
        STATUS_KO = {
            "focused":    "집중",
            "distracted": "딴짓",
            "drowsy":     "졸음",
            "uncertain":  "불명확",
        }
        s_color = STATUS_COLOR.get(score.status, C_GRAY)
        s_label = STATUS_KO.get(score.status, score.status)

        # 상태 텍스트 (상단 중앙)
        put_ko_text(frame, f"상태: {s_label}", (img_w // 2 - 52, 10), 20, s_color)

        # 후보 전환 진행바 (상단 바 하단)
        if score.candidate != score.status:
            bar_len = int((img_w - 200) * score.confirm_ratio)
            cv2.rectangle(frame, (100, 40), (100 + bar_len, 43),
                          STATUS_COLOR.get(score.candidate, C_GRAY), -1)

        # ── 좌측 수치 패널 ──
        y = 60
        # 시선
        if gaze_info:
            txt(frame, f"[GAZE]  Yaw {gaze_info['yaw_ratio']:+.3f}  "
                       f"Pitch {gaze_info['pitch_ratio']:+.3f}",
                (12, y), fg=C_CYAN)
            y += 22
            txt(frame, f"        EAR L:{gaze_info['left_ear']:.2f}  "
                       f"R:{gaze_info['right_ear']:.2f}",
                (12, y), fg=C_GRAY)
            y += 26
        else:
            txt(frame, "[GAZE]  얼굴 미감지", (12, y), fg=C_RED)
            y += 48

        # 머리
        if head_info:
            txt(frame,
                f"[HEAD]  Pitch {head_info['pitch']:+6.1f}°  "
                f"Yaw {head_info['yaw']:+6.1f}°  "
                f"Roll {head_info['roll']:+6.1f}°",
                (12, y), fg=C_YELLOW)
            y += 26
        else:
            txt(frame, "[HEAD]  미감지", (12, y), fg=C_RED)
            y += 26

        # 어깨
        if posture_info and posture_info["both_visible"]:
            tilt = posture_info["shoulder_tilt_ratio"]
            deg  = posture_info["tilt_deg"]
            c    = C_GREEN if abs(tilt) < 0.12 else C_RED
            txt(frame,
                f"[SHOULDER]  Tilt {tilt:+.3f}  ({deg:+.1f}°)",
                (12, y), fg=c)
        else:
            txt(frame, "[SHOULDER]  어깨 미감지", (12, y), fg=C_RED)
        y += 26

        # ── 스코어 패널 ──
        txt(frame,
            f"[SCORE]  집중도 {score.focus_score:.2f}  "
            f"피로도 {score.fatigue_score:.2f}  "
            f"EAR {score.avg_ear:.2f}",
            (12, y), fg=s_color)
        y += 22

        # 집중도 게이지 바
        bar_total = 200
        cv2.rectangle(frame, (12, y), (12 + bar_total, y + 10), (50, 50, 50), -1)
        focus_len = int(bar_total * score.focus_score)
        focus_c   = C_GREEN if score.focus_score >= 0.6 else (C_YELLOW if score.focus_score >= 0.4 else C_RED)
        cv2.rectangle(frame, (12, y), (12 + focus_len, y + 10), focus_c, -1)
        txt(frame, "FOCUS", (12 + bar_total + 6, y + 10), scale=0.38, fg=C_GRAY, bg=C_BG)
        y += 16

        # 피로도 게이지 바
        cv2.rectangle(frame, (12, y), (12 + bar_total, y + 10), (50, 50, 50), -1)
        fatigue_len = int(bar_total * score.fatigue_score)
        fatigue_c   = C_RED if score.fatigue_score >= 0.6 else (C_YELLOW if score.fatigue_score >= 0.4 else C_GREEN)
        cv2.rectangle(frame, (12, y), (12 + fatigue_len, y + 10), fatigue_c, -1)
        txt(frame, "FATIGUE", (12 + bar_total + 6, y + 10), scale=0.38, fg=C_GRAY, bg=C_BG)

        # ── 우측 시선 산점도 ──
        if SHOW_GAZE_GRAPH and yaw_hist:
            draw_gaze_graph(frame, list(yaw_hist), list(pitch_hist),
                            x0=img_w - 160, y0=50)

        cv2.imshow("Gaze / Head / Shoulder Detector", frame)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), 27):
            break
        elif key == ord('c'):
            calibrator.reset()
            gaze_smoother.reset()
            scorer.reset()
            print("[INFO] 시선 캘리브레이션 재시작")
        elif key == ord('s'):
            fname = f"screenshot_{int(time.time())}.png"
            cv2.imwrite(fname, frame)
            print(f"[INFO] 스크린샷 저장: {fname}")

    cap.release()
    cv2.destroyAllWindows()
    holistic.close()
    print("[INFO] 종료")


if __name__ == "__main__":
    main()
