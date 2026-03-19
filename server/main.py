"""
FastAPI 중계 서버
-----------------
WebSocket 엔드포인트:
  /ws/client/{session_id}/{user_id}   ← detection 클라이언트(개별 PC)
  /ws/dashboard/{session_id}          ← 프론트엔드 관리자 대시보드

REST 엔드포인트:
  GET /api/sessions/{session_id}/records      DB 전체 기록 조회
  GET /api/sessions/{session_id}/snapshot     현재 연결 유저 스냅샷
  GET /api/sessions/{session_id}/summary      유저별 평균 집중도 요약

실행:
  uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from database import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Focus Analyzer Relay Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()

# session_id → set[WebSocket]  (대시보드 연결)
dashboard_ws: Dict[str, Set[WebSocket]] = defaultdict(set)

# session_id → user_id → 최신 데이터 (스냅샷용)
latest: Dict[str, Dict[str, dict]] = defaultdict(dict)

# DB 저장 버퍼: session_id → list[dict]
db_buffer: Dict[str, list] = defaultdict(list)

DB_FLUSH_INTERVAL = 5  # 초


# ─── 유틸 ─────────────────────────────────────────────────────────────────────

async def broadcast(session_id: str, message: dict):
    """해당 세션의 모든 대시보드 클라이언트에게 메시지 전송"""
    dead: Set[WebSocket] = set()
    payload = json.dumps(message, ensure_ascii=False)
    for ws in list(dashboard_ws[session_id]):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    dashboard_ws[session_id] -= dead


# ─── WebSocket: detection 클라이언트 ──────────────────────────────────────────

@app.websocket("/ws/client/{session_id}/{user_id}")
async def client_ws(websocket: WebSocket, session_id: str, user_id: str):
    await websocket.accept()
    logger.info(f"[CLIENT 연결] session={session_id}  user={user_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            data: dict = json.loads(raw)

            # 서버 타임스탬프 & 메타 정보 주입
            data["user_id"]    = user_id
            data["session_id"] = session_id
            data["timestamp"]  = datetime.now().isoformat()
            data["connected"]  = True

            # Colab 필드 기본값 (Colab 꺼져 있을 때도 DB INSERT 가능하도록)
            data.setdefault("head_pitch",       None)
            data.setdefault("head_yaw",         None)
            data.setdefault("emotion",          None)
            data.setdefault("emotion_kr",       None)
            data.setdefault("phone_detected",   None)
            data.setdefault("phone_confidence", None)

            # 최신 상태 갱신
            latest[session_id][user_id] = data

            # DB 버퍼
            db_buffer[session_id].append(data)

            # 대시보드로 실시간 브로드캐스트
            await broadcast(session_id, {"type": "user_update", **data})

    except WebSocketDisconnect:
        logger.info(f"[CLIENT 해제] session={session_id}  user={user_id}")
        if user_id in latest[session_id]:
            latest[session_id][user_id]["connected"] = False
        await broadcast(session_id, {
            "type":       "user_disconnect",
            "session_id": session_id,
            "user_id":    user_id,
        })


# ─── WebSocket: 대시보드 ───────────────────────────────────────────────────────

@app.websocket("/ws/dashboard/{session_id}")
async def dashboard_ws_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"[DASHBOARD 연결] session={session_id}")
    dashboard_ws[session_id].add(websocket)

    # 연결 직후 현재 스냅샷 전송 (새로고침 시 즉시 복원)
    snapshot = {
        "type":       "snapshot",
        "session_id": session_id,
        "users":      latest.get(session_id, {}),
    }
    await websocket.send_text(json.dumps(snapshot, ensure_ascii=False))

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info(f"[DASHBOARD 해제] session={session_id}")
        dashboard_ws[session_id].discard(websocket)


# ─── REST API ─────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/records")
async def get_records(session_id: str, limit: int = 1000):
    records = db.get_records(session_id, limit)
    return {"session_id": session_id, "count": len(records), "records": records}


@app.get("/api/sessions/{session_id}/snapshot")
async def get_snapshot(session_id: str):
    return {"session_id": session_id, "users": latest.get(session_id, {})}


@app.get("/api/sessions/{session_id}/summary")
async def get_summary(session_id: str):
    summary = db.get_user_summary(session_id)
    return {"session_id": session_id, "users": summary}


# ─── 백그라운드: 주기적 DB 저장 ───────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    asyncio.create_task(_db_flush_loop())
    logger.info("서버 시작 — DB flush 루프 시작")


async def _db_flush_loop():
    while True:
        await asyncio.sleep(DB_FLUSH_INTERVAL)
        for session_id, records in list(db_buffer.items()):
            if records:
                db.insert_records(records)
                db_buffer[session_id] = []
                logger.info(f"[DB] {session_id}: {len(records)}개 저장 완료")


# ─── 엔트리포인트 ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
