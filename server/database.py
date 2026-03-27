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

import hashlib
import os
import threading

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from dotenv import load_dotenv
load_dotenv()


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def _verify_password(password: str, hashed: str) -> bool:
    return _hash_password(password) == hashed


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
            options="-c timezone=Asia/Seoul",
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
                        id               BIGSERIAL PRIMARY KEY,
                        session_id       VARCHAR(64)  NOT NULL,
                        user_id          VARCHAR(64)  NOT NULL,
                        timestamp        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        status           VARCHAR(30),
                        focus_score      REAL,
                        fatigue_score    REAL,
                        avg_ear          REAL,
                        gaze_yaw         REAL,
                        gaze_pitch       REAL,
                        head_pitch       REAL,
                        head_yaw         REAL,
                        emotion          VARCHAR(30),
                        phone_detected   BOOLEAN,
                        phone_confidence REAL
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_session_ts
                    ON focus_records(session_id, timestamp DESC)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_user_ts
                    ON focus_records(user_id, timestamp DESC)
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name       VARCHAR(200) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        user_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name       VARCHAR(100) NOT NULL,
                        birth_date DATE NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE (name, birth_date)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS instructors (
                        instructor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        username      VARCHAR(50)  NOT NULL UNIQUE,
                        email         VARCHAR(200) NOT NULL UNIQUE,
                        password_hash VARCHAR(256) NOT NULL,
                        name          VARCHAR(100) NOT NULL,
                        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS managers (
                        manager_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        username      VARCHAR(50)  NOT NULL UNIQUE,
                        email         VARCHAR(200) NOT NULL UNIQUE,
                        password_hash VARCHAR(256) NOT NULL,
                        name          VARCHAR(100) NOT NULL,
                        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                # sessions 테이블 마이그레이션
                cur.execute("""
                    DO $$ BEGIN
                        ALTER TABLE sessions ADD COLUMN instructor_id UUID REFERENCES instructors(instructor_id) ON DELETE SET NULL;
                    EXCEPTION WHEN duplicate_column THEN NULL;
                    END $$;
                """)
                cur.execute("""
                    DO $$ BEGIN
                        ALTER TABLE sessions ADD COLUMN ended_at TIMESTAMPTZ DEFAULT NULL;
                    EXCEPTION WHEN duplicate_column THEN NULL;
                    END $$;
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS quizzes (
                        quiz_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        session_id     UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                        question       TEXT NOT NULL,
                        options        JSONB NOT NULL,
                        correct_answer TEXT NOT NULL,
                        order_num      INTEGER NOT NULL DEFAULT 1,
                        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS quiz_submissions (
                        id               BIGSERIAL PRIMARY KEY,
                        session_id       VARCHAR(64) NOT NULL,
                        user_id          VARCHAR(64) NOT NULL,
                        quiz_id          VARCHAR(64) NOT NULL,
                        submitted_answer TEXT NOT NULL,
                        is_correct       BOOLEAN NOT NULL,
                        submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE (session_id, user_id, quiz_id)
                    )
                """)
                # 기존 테이블에 컬럼이 없는 경우 추가 (마이그레이션)
                for col_def in [
                    "head_pitch       REAL",
                    "head_yaw         REAL",
                    "emotion          VARCHAR(30)",
                    "phone_detected   BOOLEAN",
                    "phone_confidence REAL",
                ]:
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
                         emotion, phone_detected, phone_confidence)
                    VALUES (%(session_id)s, %(user_id)s, %(timestamp)s, %(status)s,
                            %(focus_score)s, %(fatigue_score)s, %(avg_ear)s,
                            %(gaze_yaw)s, %(gaze_pitch)s,
                            %(head_pitch)s, %(head_yaw)s,
                            %(emotion)s,
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
                    SELECT user_id,
                           to_char(timestamp AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS+09:00') AS timestamp,
                           status,
                           focus_score, fatigue_score, avg_ear, gaze_yaw, gaze_pitch,
                           head_pitch, head_yaw,
                           emotion, phone_detected, phone_confidence
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

    # ── sessions CRUD ───────────────────────────────────────────────────────────

    # ── 강의자 인증 ──────────────────────────────────────────────────────────────

    def create_instructor(self, username: str, email: str, password: str, name: str) -> dict:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO instructors (username, email, password_hash, name)
                    VALUES (%s, %s, %s, %s)
                    RETURNING instructor_id::text, username, email, name, created_at::text
                """, (username, email, _hash_password(password), name))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self._put(conn)

    def get_instructor_by_username(self, username: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT instructor_id::text, username, email, password_hash, name
                    FROM instructors WHERE username = %s
                """, (username,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def get_instructor_by_email(self, email: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT instructor_id::text, username, email, password_hash, name
                    FROM instructors WHERE email = %s
                """, (email,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def verify_instructor(self, username: str, password: str) -> dict | None:
        instructor = self.get_instructor_by_username(username)
        if not instructor or not _verify_password(password, instructor["password_hash"]):
            return None
        del instructor["password_hash"]
        return instructor

    def list_instructors(self) -> list:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT instructor_id::text, name, username
                    FROM instructors
                    ORDER BY name
                """)
                return [dict(r) for r in cur.fetchall()]
        finally:
            self._put(conn)

    def create_manager(self, username: str, email: str, password: str, name: str) -> dict:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO managers (username, email, password_hash, name)
                    VALUES (%s, %s, %s, %s)
                    RETURNING manager_id::text, username, email, name, created_at::text
                """, (username, email, _hash_password(password), name))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self._put(conn)

    def get_manager_by_username(self, username: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT manager_id::text, username, email, password_hash, name
                    FROM managers WHERE username = %s
                """, (username,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def get_manager_by_email(self, email: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT manager_id::text, username, email, password_hash, name
                    FROM managers WHERE email = %s
                """, (email,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def verify_manager(self, username: str, password: str) -> dict | None:
        manager = self.get_manager_by_username(username)
        if not manager or not _verify_password(password, manager["password_hash"]):
            return None
        del manager["password_hash"]
        return manager

    # ── sessions CRUD ───────────────────────────────────────────────────────────

    def create_session(self, name: str, instructor_id: str | None = None) -> dict:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO sessions (name, instructor_id)
                    VALUES (%s, %s)
                    RETURNING session_id::text, name, created_at::text, instructor_id::text
                """, (name, instructor_id))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        finally:
            self._put(conn)

    def get_session(self, session_id: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT session_id::text, name, created_at::text, ended_at::text
                    FROM sessions WHERE session_id = %s
                """, (session_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def end_session(self, session_id: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE sessions SET ended_at = NOW()
                    WHERE session_id = %s
                    RETURNING session_id::text, name, ended_at::text
                """, (session_id,))
                row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self._put(conn)

    def list_sessions(self, instructor_id: str | None = None) -> list:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if instructor_id:
                    cur.execute("""
                        SELECT session_id::text, name, created_at::text, instructor_id::text, ended_at::text
                        FROM sessions WHERE instructor_id = %s ORDER BY created_at DESC
                    """, (instructor_id,))
                else:
                    cur.execute("""
                        SELECT session_id::text, name, created_at::text, instructor_id::text, ended_at::text
                        FROM sessions ORDER BY created_at DESC
                    """)
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    # ── users CRUD ──────────────────────────────────────────────────────────────

    def upsert_user(self, name: str, birth_date: str) -> dict:
        """이름+생년월일로 사용자를 찾거나 새로 생성한다. user_id(UUID)를 반환."""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO users (name, birth_date)
                    VALUES (%s, %s)
                    ON CONFLICT (name, birth_date) DO UPDATE SET name = EXCLUDED.name
                    RETURNING user_id::text, name, birth_date::text, created_at::text
                """, (name, birth_date))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        finally:
            self._put(conn)

    def get_user(self, user_id: str) -> dict | None:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT user_id::text, name, birth_date::text, created_at::text
                    FROM users WHERE user_id = %s
                """, (user_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._put(conn)

    def list_users(self) -> list:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT user_id::text, name, birth_date::text, created_at::text
                    FROM users ORDER BY name
                """)
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    def get_user_summary(self, session_id: str) -> list:
        """유저별 평균 집중도·피로도 요약 (총 집중도 평가용) — users 테이블과 조인해 name 포함"""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                        r.user_id,
                        u.name,
                        COUNT(*)              AS sample_count,
                        AVG(r.focus_score)    AS avg_focus,
                        AVG(r.fatigue_score)  AS avg_fatigue,
                        MIN(r.timestamp)      AS first_seen,
                        MAX(r.timestamp)      AS last_seen
                    FROM focus_records r
                    LEFT JOIN users u ON u.user_id::text = r.user_id
                    WHERE r.session_id = %s
                    GROUP BY r.user_id, u.name
                    ORDER BY u.name NULLS LAST
                    """,
                    (session_id,),
                )
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    # ── 퀴즈 CRUD ────────────────────────────────────────────────────────────────

    def create_quiz(self, session_id: str, question: str, options: list, correct_answer: str, order_num: int) -> dict:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                import json as _json
                cur.execute("""
                    INSERT INTO quizzes (session_id, question, options, correct_answer, order_num)
                    VALUES (%s, %s, %s::jsonb, %s, %s)
                    RETURNING quiz_id::text, session_id::text, question, options, correct_answer, order_num
                """, (session_id, question, _json.dumps(options, ensure_ascii=False), correct_answer, order_num))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        finally:
            self._put(conn)

    def get_quizzes(self, session_id: str) -> list:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT quiz_id::text, session_id::text, question, options, correct_answer, order_num
                    FROM quizzes WHERE session_id = %s ORDER BY order_num ASC
                """, (session_id,))
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    def delete_quiz(self, quiz_id: str):
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM quizzes WHERE quiz_id = %s", (quiz_id,))
            conn.commit()
        finally:
            self._put(conn)

    def submit_quiz(self, session_id: str, user_id: str, quiz_id: str, submitted_answer: str, is_correct: bool) -> dict:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO quiz_submissions (session_id, user_id, quiz_id, submitted_answer, is_correct)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (session_id, user_id, quiz_id)
                    DO UPDATE SET submitted_answer = EXCLUDED.submitted_answer,
                                  is_correct = EXCLUDED.is_correct,
                                  submitted_at = NOW()
                    RETURNING id, is_correct
                """, (session_id, user_id, quiz_id, submitted_answer, is_correct))
                row = cur.fetchone()
            conn.commit()
            return dict(row)
        finally:
            self._put(conn)

    def get_quiz_completion(self, session_id: str) -> list:
        """세션의 유저별 퀴즈 완료율 반환"""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT
                        qs.user_id,
                        u.name,
                        COUNT(CASE WHEN qs.is_correct THEN 1 END) AS correct_count,
                        COUNT(*) AS submitted_count,
                        (SELECT COUNT(*) FROM quizzes WHERE session_id = %s) AS total_quizzes
                    FROM quiz_submissions qs
                    LEFT JOIN users u ON u.user_id::text = qs.user_id
                    WHERE qs.session_id = %s
                    GROUP BY qs.user_id, u.name
                """, (session_id, session_id))
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    def get_user_quiz_submissions(self, session_id: str, user_id: str) -> list:
        """특정 학습자의 퀴즈 제출 내역"""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT quiz_id, submitted_answer, is_correct, submitted_at
                    FROM quiz_submissions
                    WHERE session_id = %s AND user_id = %s
                """, (session_id, user_id))
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)

    def get_user_records(self, session_id: str, user_id: str, limit: int = 500) -> list:
        """특정 학습자의 세션 내 기록 — 시계열·감정·상태 분석용"""
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT to_char(timestamp AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS+09:00') AS timestamp,
                           status, focus_score, fatigue_score,
                           avg_ear, gaze_yaw, gaze_pitch,
                           emotion, phone_detected
                    FROM focus_records
                    WHERE session_id = %s AND user_id = %s
                    ORDER BY timestamp ASC
                    LIMIT %s
                    """,
                    (session_id, user_id, limit),
                )
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put(conn)
