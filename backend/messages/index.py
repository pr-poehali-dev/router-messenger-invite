import os
import json
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p2895926_router_messenger_inv")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }


def resp(status, data):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False, default=str)}


def get_user(cur, token):
    safe = token.replace("'", "")
    cur.execute(f"""
        SELECT u.id, u.name, u.display_id, u.hide_phone, u.hide_last_seen,
               u.last_seen_visibility, u.phone, u.last_seen
        FROM {SCHEMA}.sessions s
        JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = '{safe}'
    """)
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    """
    Чаты и сообщения.
    action=list_chats — список диалогов текущего пользователя
    action=find_user  — найти пользователя по display_id
    action=open_chat  — открыть/создать диалог с пользователем
    action=get_messages — сообщения диалога (с поллингом: after_id)
    action=send — отправить сообщение
    action=mark_read — пометить прочитанным
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    headers = event.get("headers") or {}
    token = headers.get("x-session-token") or headers.get("X-Session-Token") or ""
    if not token:
        return resp(401, {"error": "Не авторизован"})

    conn = get_conn()
    cur = conn.cursor()

    try:
        row = get_user(cur, token)
        if not row:
            return resp(401, {"error": "Сессия не найдена"})
        me_id = row[0]

        body = {}
        raw = event.get("body") or ""
        if raw:
            body = json.loads(raw)
        qs = event.get("queryStringParameters") or {}
        action = body.get("action") or qs.get("action") or ""

        # ── LIST CHATS ────────────────────────────────────────────────────────
        if action == "list_chats":
            cur.execute(f"""
                SELECT
                    c.id AS conv_id,
                    CASE WHEN c.user_a = {me_id} THEN c.user_b ELSE c.user_a END AS other_id,
                    u.name, u.display_id, u.hide_last_seen, u.last_seen_visibility, u.last_seen,
                    (SELECT text FROM {SCHEMA}.messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_text,
                    (SELECT created_at FROM {SCHEMA}.messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_time,
                    (SELECT COUNT(*) FROM {SCHEMA}.messages m WHERE m.conversation_id = c.id AND m.sender_id != {me_id} AND m.is_read = FALSE) AS unread,
                    u.username, u.avatar_url
                FROM {SCHEMA}.conversations c
                JOIN {SCHEMA}.users u ON u.id = CASE WHEN c.user_a = {me_id} THEN c.user_b ELSE c.user_a END
                WHERE c.user_a = {me_id} OR c.user_b = {me_id}
                ORDER BY last_time DESC NULLS LAST
            """)
            rows = cur.fetchall()
            chats = []
            for r in rows:
                last_seen_val = _format_last_seen(r[4], r[5], me_id, r[6])
                chats.append({
                    "conv_id": r[0],
                    "other_id": r[1],
                    "name": r[2],
                    "display_id": r[3],
                    "last_seen_label": last_seen_val,
                    "online": _is_online(r[6]),
                    "last_text": r[7] or "",
                    "last_time": r[8].isoformat() if r[8] else None,
                    "unread": r[9],
                    "username": r[10],
                    "avatar_url": r[11],
                })
            return resp(200, {"chats": chats})

        # ── FIND USER ─────────────────────────────────────────────────────────
        if action == "find_user":
            did = str(body.get("display_id") or qs.get("display_id") or "").strip().upper().replace("'", "")
            if not did:
                return resp(400, {"error": "Укажите ID пользователя"})
            cur.execute(f"""
                SELECT id, name, display_id, about, hide_last_seen, last_seen_visibility, last_seen, hide_phone, phone_visibility, phone
                FROM {SCHEMA}.users WHERE UPPER(display_id) = '{did}' AND id != {me_id}
            """)
            u = cur.fetchone()
            if not u:
                return resp(404, {"error": "Пользователь не найден"})
            return resp(200, {"user": {
                "id": u[0], "name": u[1], "display_id": u[2], "about": u[3],
                "last_seen_label": _format_last_seen(u[4], u[5], me_id, u[6]),
                "online": _is_online(u[6]),
                "phone": u[9] if not u[7] else None,
            }})

        # ── OPEN CHAT ─────────────────────────────────────────────────────────
        if action == "open_chat":
            other_id = int(body.get("other_id") or 0)
            if not other_id or other_id == me_id:
                return resp(400, {"error": "Некорректный ID собеседника"})
            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE id = {other_id}")
            if not cur.fetchone():
                return resp(404, {"error": "Пользователь не найден"})

            a, b = min(me_id, other_id), max(me_id, other_id)
            cur.execute(f"SELECT id FROM {SCHEMA}.conversations WHERE user_a = {a} AND user_b = {b}")
            row = cur.fetchone()
            if row:
                conv_id = row[0]
            else:
                cur.execute(f"INSERT INTO {SCHEMA}.conversations (user_a, user_b) VALUES ({a}, {b}) RETURNING id")
                conv_id = cur.fetchone()[0]
                conn.commit()
            return resp(200, {"conv_id": conv_id})

        # ── GET MESSAGES ──────────────────────────────────────────────────────
        if action == "get_messages":
            conv_id = int(body.get("conv_id") or qs.get("conv_id") or 0)
            after_id = int(body.get("after_id") or qs.get("after_id") or 0)
            if not conv_id:
                return resp(400, {"error": "Укажите conv_id"})

            cur.execute(f"""
                SELECT id FROM {SCHEMA}.conversations
                WHERE id = {conv_id} AND (user_a = {me_id} OR user_b = {me_id})
            """)
            if not cur.fetchone():
                return resp(403, {"error": "Нет доступа к диалогу"})

            after_clause = f"AND m.id > {after_id}" if after_id else ""
            cur.execute(f"""
                SELECT m.id, m.sender_id, m.text, m.is_read, m.created_at,
                       m.media_url, m.media_type
                FROM {SCHEMA}.messages m
                WHERE m.conversation_id = {conv_id} {after_clause}
                ORDER BY m.created_at ASC
                LIMIT 100
            """)
            msgs = [{
                "id": r[0], "sender_id": r[1], "text": r[2] or "",
                "is_read": r[3], "created_at": r[4].isoformat(),
                "media_url": r[5], "media_type": r[6],
                "own": r[1] == me_id,
            } for r in cur.fetchall()]
            return resp(200, {"messages": msgs})

        # ── SEND ──────────────────────────────────────────────────────────────
        if action == "send":
            conv_id = int(body.get("conv_id") or 0)
            text = str(body.get("text") or "").strip().replace("'", "''")
            media_url = str(body.get("media_url") or "").replace("'", "''")
            media_type = str(body.get("media_type") or "").replace("'", "")
            if not conv_id or (not text and not media_url):
                return resp(400, {"error": "Укажите conv_id и текст или медиа"})
            if len(text) > 4000:
                return resp(400, {"error": "Сообщение слишком длинное"})

            cur.execute(f"""
                SELECT id FROM {SCHEMA}.conversations
                WHERE id = {conv_id} AND (user_a = {me_id} OR user_b = {me_id})
            """)
            if not cur.fetchone():
                return resp(403, {"error": "Нет доступа к диалогу"})

            text_val = f"'{text}'" if text else "NULL"
            media_url_val = f"'{media_url}'" if media_url else "NULL"
            media_type_val = f"'{media_type}'" if media_type else "NULL"
            cur.execute(f"""
                INSERT INTO {SCHEMA}.messages (conversation_id, sender_id, text, media_url, media_type)
                VALUES ({conv_id}, {me_id}, {text_val}, {media_url_val}, {media_type_val})
                RETURNING id, created_at
            """)
            msg_row = cur.fetchone()
            conn.commit()
            return resp(200, {"message": {
                "id": msg_row[0], "sender_id": me_id, "text": text.replace("''", "'"),
                "media_url": media_url or None, "media_type": media_type or None,
                "is_read": False, "created_at": msg_row[1].isoformat(), "own": True,
            }})

        # ── MARK READ ─────────────────────────────────────────────────────────
        if action == "mark_read":
            conv_id = int(body.get("conv_id") or 0)
            if not conv_id:
                return resp(400, {"error": "Укажите conv_id"})
            cur.execute(f"""
                UPDATE {SCHEMA}.messages SET is_read = TRUE
                WHERE conversation_id = {conv_id} AND sender_id != {me_id} AND is_read = FALSE
            """)
            conn.commit()
            return resp(200, {"ok": True})

        return resp(400, {"error": "Неизвестное действие"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()


def _is_online(last_seen) -> bool:
    if not last_seen:
        return False
    from datetime import datetime, timezone
    now = datetime.now()
    diff = (now - last_seen).total_seconds()
    return diff < 120


def _format_last_seen(hide: bool, visibility: str, viewer_id: int, last_seen) -> str:
    if hide or visibility == "nobody":
        return "Был недавно"
    if not last_seen:
        return "Не заходил"
    from datetime import datetime
    now = datetime.now()
    diff = (now - last_seen).total_seconds()
    if diff < 120:
        return "В сети"
    if diff < 3600:
        m = int(diff // 60)
        return f"Был {m} мин. назад"
    if diff < 86400:
        return f"Был сегодня в {last_seen.strftime('%H:%M')}"
    if diff < 172800:
        return f"Был вчера в {last_seen.strftime('%H:%M')}"
    return f"Был {last_seen.strftime('%d.%m.%Y')}"