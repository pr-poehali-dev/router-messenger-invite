import os
import json
import random
import secrets
import string
import urllib.request
import urllib.parse
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
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False, default=str)}


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
    """
    Авторизация и профиль.
    action: send_code | verify_code | register | login | me | update_profile | check_username | search_user
    """
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
                       u.last_seen_visibility, u.phone_visibility, u.last_seen,
                       u.avatar_url, u.is_developer
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
                       hide_phone, hide_last_seen, last_seen_visibility,
                       phone_visibility, last_seen, avatar_url, is_developer
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
            full = (user_id, phone, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11])
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
            # username — проверяем уникальность
            if "username" in body:
                uname = str(body["username"]).strip().lower().replace("'", "")
                if uname:
                    if not _valid_username(uname):
                        return resp(400, {"error": "Юзернейм: только буквы, цифры и _, от 3 до 32 символов"})
                    cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE username = '{uname}' AND id != {user_id}")
                    if cur.fetchone():
                        return resp(409, {"error": "Этот юзернейм уже занят"})
                    updates.append(f"username = '{uname}'")
                else:
                    updates.append("username = NULL")

            for field in ("name", "about", "avatar_url"):
                val = body.get(field)
                if val is not None:
                    safe_val = str(val).replace("'", "''")[:500]
                    updates.append(f"{field} = '{safe_val}'")

            for field in ("hide_phone", "hide_last_seen"):
                val = body.get(field)
                if val is not None:
                    updates.append(f"{field} = {'TRUE' if val else 'FALSE'}")

            for field in ("last_seen_visibility", "phone_visibility"):
                val = body.get(field)
                if val is not None:
                    safe_val = str(val).replace("'", "")
                    updates.append(f"{field} = '{safe_val}'")

            if updates:
                cur.execute(f"UPDATE {SCHEMA}.users SET {', '.join(updates)} WHERE id = {user_id}")
                conn.commit()
            return resp(200, {"ok": True})

        # ── CHECK_USERNAME ────────────────────────────────────────────────────
        if action == "check_username":
            uname = str(body.get("username") or "").strip().lower().replace("'", "")
            if not uname:
                return resp(400, {"error": "Укажите юзернейм"})
            if not _valid_username(uname):
                return resp(400, {"error": "Только буквы, цифры и _, от 3 до 32 символов"})
            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE username = '{uname}'")
            taken = cur.fetchone() is not None
            return resp(200, {"available": not taken})

        # ── SEARCH_USER ───────────────────────────────────────────────────────
        if action == "search_user":
            if not token:
                return resp(401, {"error": "Не авторизован"})
            safe_token = token.replace("'", "")
            cur.execute(f"SELECT u.id FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id WHERE s.token = '{safe_token}'")
            me_row = cur.fetchone()
            if not me_row:
                return resp(401, {"error": "Не авторизован"})
            me_id = me_row[0]

            q = str(body.get("query") or qs.get("query") or "").strip().lower().lstrip("@").replace("'", "")
            if not q or len(q) < 2:
                return resp(400, {"error": "Введите минимум 2 символа"})

            cur.execute(f"""
                SELECT id, name, username, display_id, about,
                       hide_last_seen, last_seen_visibility, last_seen, avatar_url
                FROM {SCHEMA}.users
                WHERE id != {me_id}
                  AND username IS NOT NULL
                  AND username ILIKE '{q}%'
                LIMIT 10
            """)
            rows = cur.fetchall()
            users = []
            for r in rows:
                users.append({
                    "id": r[0], "name": r[1], "username": r[2],
                    "display_id": r[3], "about": r[4],
                    "avatar_url": r[8],
                    "online": _is_online(r[6], r[7]),
                    "last_seen_label": _fmt_last_seen(r[5], r[6], r[7]),
                })
            return resp(200, {"users": users})

        return resp(400, {"error": "Неизвестное действие"})

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()


def _clean(v):
    return str(v or "").strip().replace("'", "")


def _valid_username(u: str) -> bool:
    import re
    return bool(re.match(r'^[a-z0-9_]{3,32}$', u))


def _user_dict(row):
    return {
        "id": row[0], "phone": row[1], "name": row[2],
        "username": row[3], "about": row[4], "display_id": row[5],
        "hide_phone": row[6] or False, "hide_last_seen": row[7] or False,
        "last_seen_visibility": row[8] or "everyone",
        "phone_visibility": row[9] or "everyone",
        "last_seen": row[10].isoformat() if row[10] else None,
        "avatar_url": row[11],
        "is_developer": row[12] or False,
    }


def _unique_display_id(cur):
    for _ in range(10):
        did = gen_display_id()
        cur.execute(f"SELECT 1 FROM {SCHEMA}.users WHERE display_id = '{did}'")
        if not cur.fetchone():
            return did
    return gen_display_id()


def _is_online(visibility, last_seen) -> bool:
    if visibility == "nobody" or not last_seen:
        return False
    from datetime import datetime
    return (datetime.now() - last_seen).total_seconds() < 120


def _fmt_last_seen(hide, visibility, last_seen) -> str:
    if hide or visibility == "nobody":
        return "Был недавно"
    if not last_seen:
        return "Не заходил"
    from datetime import datetime
    diff = (datetime.now() - last_seen).total_seconds()
    if diff < 120:
        return "В сети"
    if diff < 3600:
        return f"Был {int(diff // 60)} мин. назад"
    if diff < 86400:
        return f"Был сегодня в {last_seen.strftime('%H:%M')}"
    if diff < 172800:
        return f"Был вчера в {last_seen.strftime('%H:%M')}"
    return f"Был {last_seen.strftime('%d.%m.%Y')}"
