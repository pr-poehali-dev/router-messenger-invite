import os
import json
import secrets
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
        SELECT u.id, u.name, u.username, u.avatar_url
        FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = '{safe}'
    """)
    return cur.fetchone()


def gen_group_invite():
    return "GRP-" + secrets.token_hex(6).upper()


def handler(event: dict, context) -> dict:
    """
    Группы и каналы.
    action: create | list | join | get_messages | send | leave | get_info
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
        user = get_user(cur, token)
        if not user:
            return resp(401, {"error": "Сессия не найдена"})
        me_id = user[0]

        body = {}
        raw = event.get("body") or ""
        if raw:
            body = json.loads(raw)
        qs = event.get("queryStringParameters") or {}
        action = body.get("action") or qs.get("action") or ""

        # ── CREATE ────────────────────────────────────────────────────────────
        if action == "create":
            name = str(body.get("name") or "").strip().replace("'", "''")
            gtype = str(body.get("type") or "group")
            if gtype not in ("group", "channel"):
                gtype = "group"
            desc = str(body.get("description") or "").replace("'", "''")[:500]
            if not name:
                return resp(400, {"error": "Укажите название"})

            invite_code = gen_group_invite()
            cur.execute(f"""
                INSERT INTO {SCHEMA}.groups (type, name, description, owner_id, invite_code)
                VALUES ('{gtype}', '{name}', '{desc}', {me_id}, '{invite_code}')
                RETURNING id
            """)
            group_id = cur.fetchone()[0]
            cur.execute(f"""
                INSERT INTO {SCHEMA}.group_members (group_id, user_id, role)
                VALUES ({group_id}, {me_id}, 'owner')
            """)
            conn.commit()
            return resp(200, {"group_id": group_id, "invite_code": invite_code})

        # ── LIST ──────────────────────────────────────────────────────────────
        if action == "list":
            cur.execute(f"""
                SELECT g.id, g.type, g.name, g.description, g.avatar_url, g.invite_code,
                       g.owner_id,
                       (SELECT COUNT(*) FROM {SCHEMA}.group_members gm2 WHERE gm2.group_id = g.id) AS members,
                       (SELECT text FROM {SCHEMA}.group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_text,
                       (SELECT created_at FROM {SCHEMA}.group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_time
                FROM {SCHEMA}.groups g
                JOIN {SCHEMA}.group_members gm ON gm.group_id = g.id AND gm.user_id = {me_id}
                ORDER BY last_time DESC NULLS LAST
            """)
            groups = [{
                "id": r[0], "type": r[1], "name": r[2], "description": r[3],
                "avatar_url": r[4], "invite_code": r[5],
                "is_owner": r[6] == me_id,
                "members": r[7], "last_text": r[8] or "",
                "last_time": r[9].isoformat() if r[9] else None,
            } for r in cur.fetchall()]
            return resp(200, {"groups": groups})

        # ── JOIN ──────────────────────────────────────────────────────────────
        if action == "join":
            invite_code = str(body.get("invite_code") or "").strip().replace("'", "")
            if not invite_code:
                return resp(400, {"error": "Укажите код приглашения"})
            cur.execute(f"SELECT id, name, type FROM {SCHEMA}.groups WHERE invite_code = '{invite_code}'")
            g = cur.fetchone()
            if not g:
                return resp(404, {"error": "Группа не найдена"})
            group_id = g[0]
            cur.execute(f"SELECT id FROM {SCHEMA}.group_members WHERE group_id = {group_id} AND user_id = {me_id}")
            if cur.fetchone():
                return resp(200, {"group_id": group_id, "already_member": True})
            cur.execute(f"INSERT INTO {SCHEMA}.group_members (group_id, user_id) VALUES ({group_id}, {me_id})")
            conn.commit()
            return resp(200, {"group_id": group_id, "name": g[1], "type": g[2]})

        # ── GET_MESSAGES ──────────────────────────────────────────────────────
        if action == "get_messages":
            group_id = int(body.get("group_id") or qs.get("group_id") or 0)
            after_id = int(body.get("after_id") or qs.get("after_id") or 0)
            if not group_id:
                return resp(400, {"error": "Укажите group_id"})
            cur.execute(f"SELECT id FROM {SCHEMA}.group_members WHERE group_id = {group_id} AND user_id = {me_id}")
            if not cur.fetchone():
                return resp(403, {"error": "Нет доступа"})
            after_clause = f"AND gm.id > {after_id}" if after_id else ""
            cur.execute(f"""
                SELECT gm.id, gm.sender_id, u.name, u.username, u.avatar_url,
                       gm.text, gm.media_url, gm.media_type, gm.created_at
                FROM {SCHEMA}.group_messages gm
                JOIN {SCHEMA}.users u ON u.id = gm.sender_id
                WHERE gm.group_id = {group_id} {after_clause}
                ORDER BY gm.created_at ASC LIMIT 100
            """)
            msgs = [{
                "id": r[0], "sender_id": r[1], "sender_name": r[2],
                "sender_username": r[3], "sender_avatar": r[4],
                "text": r[5], "media_url": r[6], "media_type": r[7],
                "created_at": r[8].isoformat(), "own": r[1] == me_id,
            } for r in cur.fetchall()]
            return resp(200, {"messages": msgs})

        # ── SEND ──────────────────────────────────────────────────────────────
        if action == "send":
            group_id = int(body.get("group_id") or 0)
            text = str(body.get("text") or "").strip().replace("'", "''")
            media_url = str(body.get("media_url") or "").replace("'", "''")
            media_type = str(body.get("media_type") or "").replace("'", "")
            if not group_id or (not text and not media_url):
                return resp(400, {"error": "Укажите group_id и текст или медиа"})
            cur.execute(f"SELECT id FROM {SCHEMA}.group_members WHERE group_id = {group_id} AND user_id = {me_id}")
            if not cur.fetchone():
                return resp(403, {"error": "Нет доступа"})
            text_val = f"'{text}'" if text else "NULL"
            media_url_val = f"'{media_url}'" if media_url else "NULL"
            media_type_val = f"'{media_type}'" if media_type else "NULL"
            cur.execute(f"""
                INSERT INTO {SCHEMA}.group_messages (group_id, sender_id, text, media_url, media_type)
                VALUES ({group_id}, {me_id}, {text_val}, {media_url_val}, {media_type_val})
                RETURNING id, created_at
            """)
            row = cur.fetchone()
            conn.commit()
            return resp(200, {"message": {
                "id": row[0], "sender_id": me_id, "sender_name": user[1],
                "sender_username": user[2], "sender_avatar": user[3],
                "text": text.replace("''", "'"), "media_url": media_url or None,
                "media_type": media_type or None,
                "created_at": row[1].isoformat(), "own": True,
            }})

        # ── GET_INFO ──────────────────────────────────────────────────────────
        if action == "get_info":
            group_id = int(body.get("group_id") or qs.get("group_id") or 0)
            if not group_id:
                return resp(400, {"error": "Укажите group_id"})
            cur.execute(f"""
                SELECT g.id, g.type, g.name, g.description, g.avatar_url,
                       g.invite_code, g.owner_id,
                       (SELECT COUNT(*) FROM {SCHEMA}.group_members WHERE group_id = g.id) AS cnt
                FROM {SCHEMA}.groups g
                JOIN {SCHEMA}.group_members gm ON gm.group_id = g.id AND gm.user_id = {me_id}
                WHERE g.id = {group_id}
            """)
            g = cur.fetchone()
            if not g:
                return resp(404, {"error": "Не найдено"})
            return resp(200, {"group": {
                "id": g[0], "type": g[1], "name": g[2], "description": g[3],
                "avatar_url": g[4], "invite_code": g[5] if g[6] == me_id else None,
                "is_owner": g[6] == me_id, "members": g[7],
            }})

        # ── LEAVE ─────────────────────────────────────────────────────────────
        if action == "leave":
            group_id = int(body.get("group_id") or 0)
            cur.execute(f"SELECT owner_id FROM {SCHEMA}.groups WHERE id = {group_id}")
            g = cur.fetchone()
            if g and g[0] == me_id:
                return resp(400, {"error": "Владелец не может покинуть группу"})
            cur.execute(f"UPDATE {SCHEMA}.group_members SET user_id = user_id WHERE group_id = {group_id} AND user_id = {me_id}")
            conn.commit()
            return resp(200, {"ok": True})

        return resp(400, {"error": "Неизвестное действие"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()
