"""
WebSocket Sender
----------------
detection/main.py의 분석 결과를 FastAPI 서버로 전송한다.

별도 데몬 스레드에서 asyncio 루프를 실행하고,
메인 스레드(OpenCV 루프)는 send()로 큐에 데이터를 넣기만 한다.
서버가 꺼져 있으면 자동으로 재연결을 시도한다.

사용법:
    sender = WSSender("ws://localhost:8000/ws/client/sess_abc123/cam1")
    sender.send({"status": "focused", "focus_score": 0.85, ...})
"""

import asyncio
import json
import queue
import threading


class WSSender:
    def __init__(self, url: str):
        self.url = url
        self._queue: queue.Queue = queue.Queue(maxsize=50)
        self._thread = threading.Thread(target=self._run, daemon=True, name="WSSender")
        self._connected = False
        self._thread.start()

    @property
    def connected(self) -> bool:
        return self._connected

    def send(self, data: dict):
        """메인 스레드에서 호출. 큐가 꽉 차면 가장 오래된 항목을 버린다."""
        if self._queue.full():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
        try:
            self._queue.put_nowait(data)
        except queue.Full:
            pass

    def _run(self):
        asyncio.run(self._async_loop())

    async def _async_loop(self):
        # websockets 라이브러리를 동적 임포트 (없으면 WS 비활성화)
        try:
            import websockets
        except ImportError:
            print("[WS] websockets 라이브러리가 없습니다. pip install websockets")
            return

        while True:
            try:
                print(f"[WS] 서버 연결 시도: {self.url}")
                async with websockets.connect(
                    self.url,
                    ping_interval=20,
                    ping_timeout=10,
                    open_timeout=5,
                ) as ws:
                    self._connected = True
                    print("[WS] 서버 연결 성공")
                    while True:
                        try:
                            data = self._queue.get(timeout=0.2)
                            await ws.send(json.dumps(data, ensure_ascii=False))
                        except queue.Empty:
                            await asyncio.sleep(0.01)
            except Exception as e:
                self._connected = False
                print(f"[WS] 연결 오류: {e}  → 3초 후 재연결...")
                await asyncio.sleep(3)
