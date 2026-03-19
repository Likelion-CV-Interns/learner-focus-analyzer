"""
Colab Sender
------------
detection/main.py의 프레임을 Colab FastAPI 서버로 전송하고
모델 추론 결과(표정, 핸드폰 감지)를 비동기로 받아온다.

- 별도 데몬 스레드에서 HTTP POST 실행 (OpenCV 루프 블로킹 방지)
- 큐에는 항상 최신 프레임만 유지 (1개)
- 전송 주기는 interval(초)로 조절
- Colab 서버가 없거나 오류 나도 메인 루프에 영향 없음

사용법:
    sender = ColabSender("https://xxxx-xxxx.ngrok.io", interval=1.0)
    sender.push_frame(frame)          # 매 루프에서 호출
    result = sender.result             # 최신 결과 dict 읽기
    # {"expression": "neutral", "phone_detected": False, ...}
"""

import threading
import queue
import time

import cv2
import numpy as np
import requests


class ColabSender:
    def __init__(self, base_url: str, interval: float = 1.0,
                 resize: tuple = (320, 240), jpeg_quality: int = 60):
        """
        base_url      : Colab ngrok URL (예: "https://xxxx-xxxx.ngrok.io")
        interval      : 전송 간격 (초). 무거운 모델일수록 크게 설정
        resize        : 전송 전 프레임 축소 해상도 (width, height)
        jpeg_quality  : JPEG 압축 품질 (0~100)
        """
        self._url = base_url.rstrip("/") + "/analyze"
        self._interval = interval
        self._resize = resize
        self._jpeg_quality = jpeg_quality

        self._queue: queue.Queue = queue.Queue(maxsize=1)
        self._result: dict = {}
        self._connected: bool = False

        self._thread = threading.Thread(target=self._run, daemon=True, name="ColabSender")
        self._thread.start()

    # ─── public API ──────────────────────────────────────────────────────────

    def push_frame(self, frame: np.ndarray):
        """메인 루프에서 호출. 항상 최신 프레임만 큐에 유지."""
        # 큐가 차 있으면 버리고 새 프레임 넣기
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        try:
            self._queue.put_nowait(frame)
        except queue.Full:
            pass

    @property
    def result(self) -> dict:
        """최신 추론 결과 반환. 아직 결과 없으면 빈 dict."""
        return self._result

    @property
    def connected(self) -> bool:
        return self._connected

    def update_url(self, new_base_url: str):
        """Colab 재시작으로 ngrok URL이 바뀌었을 때 런타임에 갱신."""
        self._url = new_base_url.rstrip("/") + "/analyze"
        print(f"[Colab] URL 갱신: {self._url}")

    # ─── 내부 ────────────────────────────────────────────────────────────────

    def _run(self):
        while True:
            try:
                frame = self._queue.get(timeout=self._interval)
            except queue.Empty:
                continue

            try:
                # 1. 축소 + JPEG 압축
                small = cv2.resize(frame, self._resize)
                ok, buf = cv2.imencode(
                    ".jpg", small,
                    [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality]
                )
                if not ok:
                    continue

                # 2. POST 전송
                resp = requests.post(
                    self._url,
                    files={"file": ("frame.jpg", buf.tobytes(), "image/jpeg")},
                    timeout=5.0,
                )
                resp.raise_for_status()

                # 3. 결과 저장
                self._result = resp.json()
                self._connected = True

            except requests.exceptions.ConnectionError:
                self._connected = False
                print("[Colab] 연결 실패 — Colab 서버가 실행 중인지 확인하세요.")
                time.sleep(3)
            except requests.exceptions.Timeout:
                self._connected = False
                print("[Colab] 응답 타임아웃 — 모델 추론이 너무 오래 걸립니다.")
            except Exception as e:
                self._connected = False
                print(f"[Colab] 오류: {e}")
                time.sleep(1)
