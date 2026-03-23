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

import json
import urllib.request
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
WS_ENABLED       = True
WS_SERVER        = "ws://localhost:8000"
API_SERVER       = "http://localhost:8000"   # REST API 서버 (WS_SERVER와 동일 호스트)
WS_SEND_INTERVAL = 0.1                       # 전송 간격 (초)


def _api_post(path: str, body: dict) -> dict:
    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_SERVER}{path}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def _api_get(path: str) -> dict:
    with urllib.request.urlopen(f"{API_SERVER}{path}", timeout=5) as resp:
        return json.loads(resp.read())


def setup_session() -> str | None:
    """강의 세션 UUID를 확정한다. 기존 세션에 참가하거나 목록에서 선택한다."""
    print("\n" + "=" * 55)
    print("  세션 선택")
    print("=" * 55)
    try:
        data = _api_get("/api/sessions")
        sessions = data.get("sessions", [])
    except Exception as e:
        print(f"  [경고] 세션 목록 조회 실패: {e}\n")
        return None

    if sessions:
        print("  최근 세션 목록:")
        for i, s in enumerate(sessions[:5], 1):
            print(f"    {i}. {s['name']}  ({s['session_id'][:8]}...)")
        print()

    session_id = input("  세션 UUID 입력 (없으면 Enter → 목록 첫 번째 사용): ").strip()

    if not session_id and sessions:
        session_id = sessions[0]["session_id"]
        print(f"  → {sessions[0]['name']} 세션 사용")

    if not session_id:
        print("  [경고] 사용 가능한 세션이 없습니다. 강의자가 먼저 세션을 생성해야 합니다.\n")
        return None

    print("=" * 55 + "\n")
    return session_id


def register_user() -> str | None:
    """카메라 시작 전 이름·생년월일을 입력받아 user_id(UUID)를 반환한다.
    동일한 이름+생년월일이면 기존 user_id를 재사용하므로 재접속 시에도 이력이 이어진다."""
    print("=" * 55)
    print("  학습자 등록")
    print("=" * 55)
    name       = input("  이름       : ").strip()
    birth_date = input("  생년월일   (YYYY-MM-DD) : ").strip()
    print("=" * 55)

    try:
        data = _api_post("/api/users", {"name": name, "birth_date": birth_date})
        user_id = data["user_id"]
        print(f"  [등록 완료] {name}  user_id: {user_id[:8]}...\n")
        return user_id
    except Exception as e:
        print(f"  [경고] 서버 등록 실패: {e}")
        print("  오프라인 모드로 시작합니다.\n")
        return None

# ─── Colab 설정 ───────────────────────────────────────────────────────────────
# Colab에서 ngrok URL이 출력되면 아래에 붙여넣기
# 서버가 없으면 COLAB_ENABLED = False 로 두면 됩니다.
COLAB_ENABLED  = True
COLAB_URL      = "https://waylon-unfancy-overidly.ngrok-free.dev"  # Colab 실행 후 출력된 URL
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
        session_id = setup_session()
        user_id    = register_user() if session_id else None
        if session_id and user_id:
            ws_url = f"{WS_SERVER}/ws/client/{session_id}/{user_id}"
            ws_sender = WSSender(ws_url)
            print(f"[WS] 전송 대상: {ws_url}")
        else:
            print("[WS] 세션 또는 사용자 등록 실패 — 오프라인 모드로 시작합니다.")

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


        # ── 랜드마크 시각화 ──
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

        # ── 상태별 색상 / 라벨 ──
        STATUS_COLOR = {
            "focused":    C_GREEN,
            "focusing":   C_CYAN,
            "distracted": C_YELLOW,
            "drowsy":     C_RED,
            "uncertain":  C_GRAY,
        }
        STATUS_KO = {
            "focused":    "집중",
            "focusing":   "집중 시작",
            "distracted": "딴짓",
            "drowsy":     "졸음",
            "uncertain":  "불명확",
        }
        s_color = STATUS_COLOR.get(score.status, C_GRAY)
        s_label = STATUS_KO.get(score.status, score.status)

        # ── Colab 결과 ──
        colab_result   = colab_sender.result if colab_sender else {}
        emotion_kr     = colab_result.get("emotion_kr", "-")
        expr_conf      = colab_result.get("confidence", 0.0)
        phone_detected = colab_result.get("phone_detected", False)
        phone_conf     = colab_result.get("phone_confidence", 0.0)

        # ── 핸드폰 감지 오버레이 ──
        if phone_detected:
            cv2.rectangle(frame, (3, 3), (img_w - 3, img_h - 3), (200, 50, 220), 3)
            put_ko_text(frame, f"핸드폰 감지  {phone_conf:.0%}",
                        (img_w // 2 - 90, img_h - 96), 22, (200, 100, 255))

        # ── 상단 바 ──
        cv2.rectangle(frame, (0, 0), (img_w, 46), (20, 20, 20), -1)
        now = time.time()
        fps = 1.0 / max(now - prev_time, 1e-6)
        prev_time = now

        # 상태 (좌측)
        put_ko_text(frame, f"● {s_label}", (12, 8), 22, s_color)

        # 표정 (중앙)
        put_ko_text(frame, f"표정: {emotion_kr}  {expr_conf:.0%}", (img_w // 2 - 65, 8), 18, C_CYAN)

        # WS / COLAB / FPS (우측)
        if colab_sender:
            cl_c = C_GREEN if colab_sender.connected else C_YELLOW
            cv2.putText(frame, "CL", (img_w - 145, 30), FONT, 0.45, cl_c, 1, cv2.LINE_AA)
        if ws_sender:
            ws_c = C_GREEN if ws_sender.connected else C_YELLOW
            cv2.putText(frame, "WS", (img_w - 115, 30), FONT, 0.45, ws_c, 1, cv2.LINE_AA)
        cv2.putText(frame, f"{fps:.0f}fps", (img_w - 80, 30), FONT, 0.45, C_GRAY, 1, cv2.LINE_AA)

        # 후보 전환 진행바
        if score.candidate != score.status:
            bar_len = int((img_w - 200) * score.confirm_ratio)
            cv2.rectangle(frame, (100, 42), (100 + bar_len, 45),
                          STATUS_COLOR.get(score.candidate, C_GRAY), -1)

        # ── 하단 정보 패널 ──
        PANEL_H = 82
        panel_y = img_h - PANEL_H
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, panel_y), (img_w, img_h), (15, 15, 15), -1)
        cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)

        bar_w = img_w // 2 - 24
        bx    = 72

        # 집중도 바
        by = panel_y + 12
        cv2.putText(frame, "FOCUS",   (10, by + 10), FONT, 0.42, C_GRAY, 1, cv2.LINE_AA)
        cv2.rectangle(frame, (bx, by), (bx + bar_w, by + 12), (50, 50, 50), -1)
        focus_c = C_GREEN if score.focus_score >= 0.6 else (C_YELLOW if score.focus_score >= 0.4 else C_RED)
        cv2.rectangle(frame, (bx, by), (bx + int(bar_w * score.focus_score), by + 12), focus_c, -1)
        cv2.putText(frame, f"{score.focus_score:.0%}", (bx + bar_w + 6, by + 11),
                    FONT, 0.45, focus_c, 1, cv2.LINE_AA)

        # 피로도 바
        by2 = panel_y + 38
        cv2.putText(frame, "FATIGUE", (10, by2 + 10), FONT, 0.42, C_GRAY, 1, cv2.LINE_AA)
        cv2.rectangle(frame, (bx, by2), (bx + bar_w, by2 + 12), (50, 50, 50), -1)
        fatigue_c = C_RED if score.fatigue_score >= 0.6 else (C_YELLOW if score.fatigue_score >= 0.4 else C_GREEN)
        cv2.rectangle(frame, (bx, by2), (bx + int(bar_w * score.fatigue_score), by2 + 12), fatigue_c, -1)
        cv2.putText(frame, f"{score.fatigue_score:.0%}", (bx + bar_w + 6, by2 + 11),
                    FONT, 0.45, fatigue_c, 1, cv2.LINE_AA)

        # 우측 핵심 수치 4줄
        rx = img_w // 2 + 12
        ry = panel_y + 14
        ear_val  = f"EAR {score.avg_ear:.2f}"
        gaze_val = (f"Gaze {gaze_info['yaw_ratio']:+.2f} / {gaze_info['pitch_ratio']:+.2f}"
                    if gaze_info else "Gaze -")
        head_val = (f"Head  P{head_info['pitch']:+.0f}  Y{head_info['yaw']:+.0f}"
                    if head_info else "Head -")
        if posture_info and posture_info["both_visible"]:
            sh_ok  = abs(posture_info["shoulder_tilt_ratio"]) < 0.12
            sh_c   = C_GREEN if sh_ok else C_RED
            sh_deg = posture_info["tilt_deg"]
            sh_val = f"Shoulder  OK" if sh_ok else f"Shoulder  {sh_deg:+.1f}deg"
        else:
            sh_val, sh_c = "Shoulder -", C_GRAY

        cv2.putText(frame, ear_val,  (rx, ry),      FONT, 0.42, C_GRAY,   1, cv2.LINE_AA)
        cv2.putText(frame, gaze_val, (rx, ry + 18), FONT, 0.42, C_CYAN,   1, cv2.LINE_AA)
        cv2.putText(frame, head_val, (rx, ry + 36), FONT, 0.42, C_YELLOW, 1, cv2.LINE_AA)
        cv2.putText(frame, sh_val,   (rx, ry + 54), FONT, 0.42, sh_c,     1, cv2.LINE_AA)

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
