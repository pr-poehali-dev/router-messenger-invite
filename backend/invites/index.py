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
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False)}


def get_user(cur, token):
    safe = token.replace("'", "")
    cur.execute(f"""
        SELECT u.id, u.name FROM {SCHEMA}.sessions s
        JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = '{safe}'
    """)
    return cur.fetchone()


def gen_unique_code(cur):
    for _ in range(20):
        parts = [secrets.token_hex(4).upper() for _ in range(3)]
        code = "SFERA-" + "-".join(parts)
        cur.execute(f"SELECT 1 FROM {SCHEMA}.invite_codes WHERE code = '{code}'")
        if not cur.fetchone():
            return code
    raise ValueError("Не удалось сгенерировать уникальный код")


def handler(event: dict, context) -> dict:
    """Инвайт-коды: список, генерация нового, счётчик приглашённых."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
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

        user_id = user[0]

        # GET — список кодов + счётчик приглашённых
        if method == "GET":
            cur.execute(f"""
                SELECT ic.code, ic.is_used, ic.created_at, ic.used_at,
                       u.name AS used_by_name, u.display_id AS used_by_display_id
                FROM {SCHEMA}.invite_codes ic
                LEFT JOIN {SCHEMA}.users u ON u.id = ic.used_by_user_id
                WHERE ic.owner_user_id = {user_id}
                ORDER BY ic.created_at DESC
            """)
            rows = cur.fetchall()

            cur.execute(f"""
                SELECT COUNT(*) FROM {SCHEMA}.invite_codes
                WHERE owner_user_id = {user_id} AND is_used = TRUE
            """)
            invited_count = cur.fetchone()[0]

            codes = [{
                "code": r[0],
                "is_used": r[1],
                "created_at": r[2].isoformat() if r[2] else None,
                "used_at": r[3].isoformat() if r[3] else None,
                "used_by": r[4],
                "used_by_display_id": r[5],
            } for r in rows]

            return resp(200, {"codes": codes, "invited_count": invited_count})

        # POST — сгенерировать новый код
        if method == "POST":
            code = gen_unique_code(cur)
            cur.execute(f"INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id) VALUES ('{code}', {user_id})")
            conn.commit()
            return resp(200, {"code": code})

        return resp(404, {"error": "Not found"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()
