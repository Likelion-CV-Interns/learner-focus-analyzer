"""
PostgreSQL 헬퍼
---------------
psycopg2 ThreadedConnectionPool을 사용한다.
연결 정보는 환경변수로 관리한다.

환경변수:
  DB_HOST     (기본: localhost)
  DB_PORT     (기본: 5432)
  DB_NAME     (기본: focus_db)
  DB_USER     (기본: postgres)
  DB_PASSWORD (기본: '')

사용 전 DB 및 테이블 생성:
  CREATE DATABASE focus_db;
  -- 테이블은 Database() 인스턴스 생성 시 자동으로 만들어짐
"""

import os
import threading

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from dotenv import load_dotenv
load_dotenv()


class Database:
    def __init__(self):
        self._pool = pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", 5432)),
            dbname=os.getenv("DB_NAME", "focus_db"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", ""),
        )
        self._lock = threading.Lock()
        self._init_db()

    def _conn(self):
        return self._pool.getconn()

    def _put(self, conn):
        self._pool.putconn(conn)

    def _init_db(self):
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS focus_records (
                        id               SERIAL PRIMARY KEY,
                        session_id       TEXT        NOT NULL,
                        user_id          TEXT        NOT NULL,
                        timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        status           TEXT,
                        focus_score      REAL,
                        fatigue_score    REAL,
                        avg_ear          REAL,
                        gaze_yaw         REAL,
                        gaze_pitch       REAL,
                        head_pitch       REAL,
                        head_yaw         REAL,
                        emotion          TEXT,
                        emotion_kr       TEXT,
                        phone_detected   BOOLEAN,
                        phone_confidence REAL
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_session_ts
                    ON focus_records(session_id, timestamp DESC)
                """)
                # 기존 테이블에 컬럼이 없는 경우 추가 (마이그레이션)
                for col_def in [
                    "head_pitch       REAL",
                    "head_yaw         REAL",
                    "emotion          TEXT",
                    "emotion_kr       TEXT",
                    "phone_detected   BOOLEAN",
                    "phone_confidence REAL",
                ]:
                    col_name = col_def.split()[0]
                    cur.execute(f"""
                        DO $$ BEGIN
                            ALTER TABLE focus_records ADD COLUMN {col_def};
                        EXCEPTION WHEN duplicate_column THEN NULL;
                        END $$;
                    """)
            conn.commit()
        finally:
            self._put(conn)

    def insert_records(self, records: list):
        if not records:
            return
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO focus_records
                        (session_id, user_id, timestamp, status,
                         focus_score, fatigue_score, avg_ear, gaze_yaw, gaze_pitch,
                         head_pitch, head_yaw,
                         emotion, emotion_kr, phone_detected, phone_confidence)
                    VALUES (%(session_id)s, %(user_id)s, %(timestamp)s, %(status)s,
                            %(focus_score)s, %(fatigue_score)s, %(avg_ear)s,
                            %(gaze_yaw)s, %(gaze_pitch)s,
                            %(head_pitch)s, %(head_yaw)s,
                            %(emotion)s, %(emotion_kr)s,
                            %(phone_detected)s, %(phone_confidence)s)
                    """,
                    records,
                )
            conn.commit()
        finally:
            self._put(conn)

    def get_records(self, session_id: str, limit: int = 1000) -> list:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT user_id, timestamp, status,
                           focus_score, fatigue_score, avg_ear, gaze_yaw, gaze_pitch,
                           head_pitch, head_yaw,
                           emotion, emotion_kr, phone_detected, phone_confidence
                    FROM focus_records
                    WHERE session_id = %s
                    ORDER BY timestamp DESC
                    LIMIT %s
                    """,
                    (session_id, limit),
                )
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    def get_user_summary(self, session_id: str) -> list:
        """유저별 평균 집중도·피로도 요약 (총 집중도 평가용)"""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                        user_id,
                        COUNT(*)              AS sample_count,
                        AVG(focus_score)      AS avg_focus,
                        AVG(fatigue_score)    AS avg_fatigue,
                        MIN(timestamp)        AS first_seen,
                        MAX(timestamp)        AS last_seen
                    FROM focus_records
                    WHERE session_id = %s
                    GROUP BY user_id
                    ORDER BY user_id
                    """,
                    (session_id,),
                )
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)
