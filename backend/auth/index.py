import os
import json
import secrets
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p2895926_router_messenger_inv")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ensure_tables(cur):
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.users (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            username VARCHAR(50) UNIQUE,
            about TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.invite_codes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(16) UNIQUE NOT NULL,
            owner_user_id INTEGER REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
            used_by_user_id INTEGER REFERENCES {SCHEMA}.users(id) ON DELETE SET NULL,
            is_used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            used_at TIMESTAMP
        )
    """)
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
            token VARCHAR(64) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            last_seen TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute(f"""
        INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id)
        SELECT 'SFERA-START001', NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.invite_codes WHERE code = 'SFERA-START001'
        )
    """)
    cur.execute(f"""
        INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id)
        SELECT 'SFERA-START002', NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.invite_codes WHERE code = 'SFERA-START002'
        )
    """)


def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }


def resp(status, data):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """Авторизация: action=register|login|me в теле запроса или query."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    headers = event.get("headers") or {}
    token = headers.get("x-session-token") or headers.get("X-Session-Token") or ""

    conn = get_conn()
    cur = conn.cursor()
    ensure_tables(cur)
    conn.commit()

    try:
        body = {}
        raw = event.get("body") or ""
        if raw:
            body = json.loads(raw)

        qs = event.get("queryStringParameters") or {}
        action = body.get("action") or qs.get("action") or ""

        # --- ME ---
        if method == "GET" or action == "me":
            if not token:
                return resp(401, {"error": "Не авторизован"})
            safe_token = token.replace("'", "")
            cur.execute(f"""
                SELECT u.id, u.phone, u.name, u.username, u.about
                FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = '{safe_token}'
            """)
            user = cur.fetchone()
            if not user:
                return resp(401, {"error": "Сессия не найдена"})
            cur.execute(f"UPDATE {SCHEMA}.sessions SET last_seen = NOW() WHERE token = '{safe_token}'")
            conn.commit()
            return resp(200, {"user": {"id": user[0], "phone": user[1], "name": user[2], "username": user[3], "about": user[4]}})

        # --- REGISTER ---
        if action == "register":
            phone = (body.get("phone") or "").strip().replace("'", "")
            name = (body.get("name") or "").strip().replace("'", "")
            invite_code = (body.get("invite_code") or "").strip().upper().replace("'", "")

            if not phone or not name or not invite_code:
                return resp(400, {"error": "Заполните все поля"})

            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE phone = '{phone}'")
            if cur.fetchone():
                return resp(409, {"error": "Этот номер уже зарегистрирован"})

            cur.execute(f"SELECT id, is_used FROM {SCHEMA}.invite_codes WHERE code = '{invite_code}'")
            invite = cur.fetchone()
            if not invite:
                return resp(403, {"error": "Недействительный код приглашения"})
            if invite[1]:
                return resp(403, {"error": "Код приглашения уже использован"})

            invite_id = invite[0]
            cur.execute(f"INSERT INTO {SCHEMA}.users (phone, name) VALUES ('{phone}', '{name}') RETURNING id")
            user_id = cur.fetchone()[0]
            cur.execute(f"UPDATE {SCHEMA}.invite_codes SET is_used = TRUE, used_by_user_id = {user_id}, used_at = NOW() WHERE id = {invite_id}")

            new_token = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{new_token}')")

            for _ in range(3):
                code = "SF-" + secrets.token_hex(4).upper()
                cur.execute(f"INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id) VALUES ('{code}', {user_id})")

            conn.commit()
            return resp(200, {"token": new_token, "user": {"id": user_id, "phone": phone, "name": name}})

        # --- LOGIN ---
        if action == "login":
            phone = (body.get("phone") or "").strip().replace("'", "")
            if not phone:
                return resp(400, {"error": "Укажите номер телефона"})

            cur.execute(f"SELECT id, name, username, about FROM {SCHEMA}.users WHERE phone = '{phone}'")
            user = cur.fetchone()
            if not user:
                return resp(404, {"error": "Пользователь не найден. Для регистрации нужно приглашение."})

            user_id = user[0]
            new_token = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{new_token}')")

            fresh_code = "SF-" + secrets.token_hex(4).upper()
            cur.execute(f"INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id) VALUES ('{fresh_code}', {user_id})")

            conn.commit()
            return resp(200, {"token": new_token, "user": {"id": user_id, "phone": phone, "name": user[1], "username": user[2], "about": user[3]}})

        return resp(400, {"error": "Неизвестное действие. Укажите action: register|login|me"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()
