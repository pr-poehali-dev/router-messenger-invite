import os
import json
import secrets
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p2895926_router_messenger_inv")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }


def get_user_from_token(cur, token):
    safe = token.replace("'", "")
    cur.execute(f"""
        SELECT u.id, u.name FROM {SCHEMA}.sessions s
        JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = '{safe}'
    """)
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    """Управление инвайт-кодами: получить свои коды, сгенерировать новый."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    headers = event.get("headers") or {}
    session_token = headers.get("x-session-token") or headers.get("X-Session-Token")

    if not session_token:
        return {"statusCode": 401, "headers": cors_headers(), "body": json.dumps({"error": "Не авторизован"})}

    conn = get_conn()
    cur = conn.cursor()

    try:
        user = get_user_from_token(cur, session_token)
        if not user:
            return {"statusCode": 401, "headers": cors_headers(), "body": json.dumps({"error": "Сессия не найдена"})}

        user_id = user[0]

        # GET /invites - list user's invite codes
        if method == "GET":
            cur.execute(f"""
                SELECT ic.code, ic.is_used, ic.created_at, ic.used_at,
                       u.name as used_by_name
                FROM {SCHEMA}.invite_codes ic
                LEFT JOIN {SCHEMA}.users u ON u.id = ic.used_by_user_id
                WHERE ic.owner_user_id = {user_id}
                ORDER BY ic.created_at DESC
            """)
            rows = cur.fetchall()
            codes = []
            for row in rows:
                codes.append({
                    "code": row[0],
                    "is_used": row[1],
                    "created_at": row[2].isoformat() if row[2] else None,
                    "used_at": row[3].isoformat() if row[3] else None,
                    "used_by": row[4],
                })
            return {"statusCode": 200, "headers": cors_headers(), "body": json.dumps({"codes": codes})}

        # POST /invites - generate a new invite code (on each login a fresh code is created)
        if method == "POST":
            code = "SF-" + secrets.token_hex(4).upper()
            cur.execute(f"INSERT INTO {SCHEMA}.invite_codes (code, owner_user_id) VALUES ('{code}', {user_id})")
            conn.commit()
            return {"statusCode": 200, "headers": cors_headers(), "body": json.dumps({"code": code})}

        return {"statusCode": 404, "headers": cors_headers(), "body": json.dumps({"error": "Not found"})}

    except Exception as e:
        conn.rollback()
        return {"statusCode": 500, "headers": cors_headers(), "body": json.dumps({"error": str(e)})}
    finally:
        cur.close()
        conn.close()
