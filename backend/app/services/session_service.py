import sqlite3
import threading
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.chat import ChatMessage, ChatSession


class SessionService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.database_path = self._database_path()
        self._lock = threading.Lock()
        self._ensure_schema()

    def create_session(self, title: str | None = None) -> str:
        session_id = uuid4().hex
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO chat_sessions (id, title) VALUES (?, ?)",
                (session_id, title),
            )
        return session_id

    def list_sessions(self) -> list[ChatSession]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    s.id,
                    s.title,
                    s.created_at,
                    s.updated_at,
                    COUNT(m.id) AS message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                GROUP BY s.id
                ORDER BY s.updated_at DESC
                """
            ).fetchall()

        return [
            ChatSession(
                id=row["id"],
                title=row["title"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                message_count=row["message_count"],
            )
            for row in rows
        ]

    def get_messages(self, session_id: str) -> list[ChatMessage]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT role, content
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY id ASC
                """,
                (session_id,),
            ).fetchall()

        return [ChatMessage(role=row["role"], content=row["content"]) for row in rows]

    def append_message(self, session_id: str, role: str, content: str) -> None:
        self.append_messages(session_id, [(role, content)])

    def append_messages(self, session_id: str, messages: list[tuple[str, str]]) -> None:
        if not messages:
            return

        with self._lock:
            with self._connect() as conn:
                first_user_message = next((content for role, content in messages if role == "user"), None)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO chat_sessions (id, title)
                    VALUES (?, ?)
                    """,
                    (session_id, self._default_title(first_user_message or "")),
                )
                conn.executemany(
                    """
                    INSERT INTO chat_messages (session_id, role, content)
                    VALUES (?, ?, ?)
                    """,
                    [(session_id, role, content) for role, content in messages],
                )
                conn.execute(
                    "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (session_id,),
                )

    def clear_session(self, session_id: str) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))

    def _database_path(self) -> Path:
        raw_path = Path(self.settings.sqlite_database_path)
        if raw_path.is_absolute():
            return raw_path
        return Path(__file__).resolve().parents[2] / raw_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = TRUNCATE")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_schema(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS chat_sessions (
                        id TEXT PRIMARY KEY,
                        title TEXT,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (session_id)
                            REFERENCES chat_sessions(id)
                            ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
                    ON chat_messages(session_id, id);
                    """
                )

    def _default_title(self, content: str) -> str:
        title = content.strip().replace("\n", " ")
        return title[:40] or "Untitled chat"
