import os
import json
import random
import secrets
import string
import urllib.request
import urllib.parse
import urllib.error
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p2895926_router_messenger_inv")
SMS_EMAIL = os.environ.get("SMSAERO_EMAIL", "")
SMS_KEY = os.environ.get("SMSAERO_API_KEY", "")
SMS_ENABLED = bool(SMS_EMAIL and SMS_KEY)


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


def gen_display_id():
    chars = string.ascii_uppercase + string.digits
    return "SF" + "".join(random.choices(chars, k=8))


def gen_invite_code():
    parts = [secrets.token_hex(4).upper() for _ in range(3)]
    return "SFERA-" + "-".join(parts)


def send_sms(phone: str, code: str) -> bool:
    if not SMS_ENABLED:
        return False
    try:
        msg = urllib.parse.quote(f"Sfera: ваш код подтверждения {code}. Не сообщайте никому.")
        safe_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
        url = f"https://gate.smsaero.ru/v2/sms/send?number={safe_phone}&text={msg}&sign=SMS+Aero&channel=DIRECT"
        import base64
        creds = base64.b64encode(f"{SMS_EMAIL}:{SMS_KEY}".encode()).decode()
        req = urllib.request.Request(url, headers={"Authorization": f"Basic {creds}"})
        with urllib.request.urlopen(req, timeout=8) as r:
            result = json.loads(r.read().decode())
            return result.get("success") is True
    except Exception:
        return False


def handler(event: dict, context) -> dict:
    """Авторизация: send_code, verify_code, register, login, me, update_profile."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    headers = event.get("headers") or {}
    token = headers.get("x-session-token") or headers.get("X-Session-Token") or ""

    conn = get_conn()
    cur = conn.cursor()

    try:
        body = {}
        raw = event.get("body") or ""
        if raw:
            body = json.loads(raw)

        qs = event.get("queryStringParameters") or {}
        action = body.get("action") or qs.get("action") or ""

        # ── GET /me ──────────────────────────────────────────────────────────
        if method == "GET" or action == "me":
            if not token:
                return resp(401, {"error": "Не авторизован"})
            safe_token = token.replace("'", "")
            cur.execute(f"""
                SELECT u.id, u.phone, u.name, u.username, u.about,
                       u.display_id, u.hide_phone, u.hide_last_seen,
                       u.last_seen_visibility, u.phone_visibility, u.last_seen
                FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = '{safe_token}'
            """)
            row = cur.fetchone()
            if not row:
                return resp(401, {"error": "Сессия не найдена"})
            cur.execute(f"UPDATE {SCHEMA}.users SET last_seen = NOW() WHERE id = {row[0]}")
            cur.execute(f"UPDATE {SCHEMA}.sessions SET last_seen = NOW() WHERE token = '{safe_token}'")
            conn.commit()
            return resp(200, {"user": _user_dict(row)})

        # ── SEND_CODE ─────────────────────────────────────────────────────────
        if action == "send_code":
            phone = _clean(body.get("phone", ""))
            if not phone:
                return resp(400, {"error": "Укажите номер телефона"})

            code = str(random.randint(100000, 999999))

            cur.execute(f"""
                INSERT INTO {SCHEMA}.phone_verifications (phone, code, expires_at)
                VALUES ('{phone}', '{code}', NOW() + INTERVAL '10 minutes')
            """)
            conn.commit()

            sent = send_sms(phone, code)
            if SMS_ENABLED and not sent:
                return resp(500, {"error": "Не удалось отправить SMS. Попробуйте позже."})

            result = {"ok": True}
            if not SMS_ENABLED:
                result["dev_code"] = code
            return resp(200, result)

        # ── VERIFY_CODE ───────────────────────────────────────────────────────
        if action == "verify_code":
            phone = _clean(body.get("phone", ""))
            code = str(body.get("code", "")).strip()
            if not phone or not code:
                return resp(400, {"error": "Укажите телефон и код"})

            cur.execute(f"""
                SELECT id FROM {SCHEMA}.phone_verifications
                WHERE phone = '{phone}' AND code = '{code}'
                  AND used = FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1
            """)
            row = cur.fetchone()
            if not row:
                return resp(403, {"error": "Неверный или истёкший код"})

            cur.execute(f"UPDATE {SCHEMA}.phone_verifications SET used = TRUE WHERE id = {row[0]}")
            conn.commit()
            return resp(200, {"verified": True})

        # ── REGISTER ──────────────────────────────────────────────────────────
        if action == "register":
            phone = _clean(body.get("phone", ""))
            name = _clean(body.get("name", ""))
            invite_code = body.get("invite_code", "").strip().upper().replace("'", "")

            if not phone or not name or not invite_code:
                return resp(400, {"error": "Заполните все поля"})

            # Verify phone was verified
            cur.execute(f"""
                SELECT id FROM {SCHEMA}.phone_verifications
                WHERE phone = '{phone}' AND used = TRUE
                ORDER BY created_at DESC LIMIT 1
            """)
            if not cur.fetchone():
                return resp(403, {"error": "Номер телефона не подтверждён"})

            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE phone = '{phone}'")
            if cur.fetchone():
                return resp(409, {"error": "Этот номер уже зарегистрирован"})

            cur.execute(f"SELECT id, is_used FROM {SCHEMA}.invite_codes WHERE code = '{invite_code}'")
            invite = cur.fetchone()
            if not invite:
                return resp(403, {"error": "Недействительный код приглашения"})
            if invite[1]:
                return resp(403, {"error": "Код приглашения уже использован"})

            display_id = _unique_display_id(cur)

            cur.execute(f"""
                INSERT INTO {SCHEMA}.users (phone, name, display_id)
                VALUES ('{phone}', '{name}', '{display_id}') RETURNING id
            """)
            user_id = cur.fetchone()[0]
            cur.execute(f"""
                UPDATE {SCHEMA}.invite_codes
                SET is_used = TRUE, used_by_user_id = {user_id}, used_at = NOW()
                WHERE id = {invite[0]}
            """)

            new_token = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{new_token}')")
            conn.commit()

            return resp(200, {"token": new_token, "user": {"id": user_id, "phone": phone, "name": name, "display_id": display_id}})

        # ── LOGIN ─────────────────────────────────────────────────────────────
        if action == "login":
            phone = _clean(body.get("phone", ""))
            if not phone:
                return resp(400, {"error": "Укажите номер телефона"})

            cur.execute(f"""
                SELECT id FROM {SCHEMA}.phone_verifications
                WHERE phone = '{phone}' AND used = TRUE
                ORDER BY created_at DESC LIMIT 1
            """)
            if not cur.fetchone():
                return resp(403, {"error": "Номер телефона не подтверждён"})

            cur.execute(f"""
                SELECT id, name, username, about, display_id,
                       hide_phone, hide_last_seen, last_seen_visibility, phone_visibility, last_seen
                FROM {SCHEMA}.users WHERE phone = '{phone}'
            """)
            row = cur.fetchone()
            if not row:
                return resp(404, {"error": "Пользователь не найден. Нужно приглашение для регистрации."})

            user_id = row[0]
            new_token = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{new_token}')")
            cur.execute(f"UPDATE {SCHEMA}.users SET last_seen = NOW() WHERE id = {user_id}")
            conn.commit()

            full = (user_id, phone, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9])
            return resp(200, {"token": new_token, "user": _user_dict(full)})

        # ── UPDATE_PROFILE ────────────────────────────────────────────────────
        if action == "update_profile":
            if not token:
                return resp(401, {"error": "Не авторизован"})
            safe_token = token.replace("'", "")
            cur.execute(f"""
                SELECT u.id FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = '{safe_token}'
            """)
            row = cur.fetchone()
            if not row:
                return resp(401, {"error": "Не авторизован"})
            user_id = row[0]

            updates = []
            allowed = {
                "name": "VARCHAR", "about": "TEXT",
                "hide_phone": "BOOL", "hide_last_seen": "BOOL",
                "last_seen_visibility": "VARCHAR", "phone_visibility": "VARCHAR",
            }
            for field, ftype in allowed.items():
                val = body.get(field)
                if val is None:
                    continue
                if ftype == "BOOL":
                    updates.append(f"{field} = {'TRUE' if val else 'FALSE'}")
                else:
                    safe_val = str(val).replace("'", "")[:200]
                    updates.append(f"{field} = '{safe_val}'")

            if updates:
                cur.execute(f"UPDATE {SCHEMA}.users SET {', '.join(updates)} WHERE id = {user_id}")
                conn.commit()
            return resp(200, {"ok": True})

        return resp(400, {"error": "Неизвестное действие"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()


def _clean(v):
    return str(v or "").strip().replace("'", "")


def _user_dict(row):
    return {
        "id": row[0],
        "phone": row[1],
        "name": row[2],
        "username": row[3],
        "about": row[4],
        "display_id": row[5],
        "hide_phone": row[6] or False,
        "hide_last_seen": row[7] or False,
        "last_seen_visibility": row[8] or "everyone",
        "phone_visibility": row[9] or "everyone",
        "last_seen": row[10].isoformat() if row[10] else None,
    }


def _unique_display_id(cur):
    for _ in range(10):
        did = gen_display_id()
        cur.execute(f"SELECT 1 FROM {SCHEMA}.users WHERE display_id = '{did}'")
        if not cur.fetchone():
            return did
    return gen_display_id()
