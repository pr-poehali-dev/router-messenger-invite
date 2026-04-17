import os
import json
import uuid
import base64
import boto3
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p2895926_router_messenger_inv")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }


def resp(status, data):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False)}


ALLOWED_TYPES = {
    "image/jpeg": ("image", "jpg"),
    "image/png": ("image", "png"),
    "image/gif": ("image", "gif"),
    "image/webp": ("image", "webp"),
    "video/mp4": ("video", "mp4"),
    "video/webm": ("video", "webm"),
    "audio/ogg": ("audio", "ogg"),
    "audio/webm": ("audio", "webm"),
    "audio/mpeg": ("audio", "mp3"),
}


def handler(event: dict, context) -> dict:
    """Загрузка медиа: изображения, видео, аудио. Base64 в теле запроса."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    headers = event.get("headers") or {}
    token = headers.get("x-session-token") or headers.get("X-Session-Token") or ""
    if not token:
        return resp(401, {"error": "Не авторизован"})

    conn = get_conn()
    cur = conn.cursor()
    try:
        safe_token = token.replace("'", "")
        cur.execute(f"SELECT u.id FROM t_p2895926_router_messenger_inv.sessions s JOIN t_p2895926_router_messenger_inv.users u ON u.id = s.user_id WHERE s.token = '{safe_token}'")
        row = cur.fetchone()
        if not row:
            return resp(401, {"error": "Не авторизован"})

        raw = event.get("body") or ""
        body = json.loads(raw) if raw else {}

        content_type = str(body.get("content_type") or "").lower()
        data_b64 = str(body.get("data") or "")

        if content_type not in ALLOWED_TYPES:
            return resp(400, {"error": f"Тип не поддерживается. Допустимые: {', '.join(ALLOWED_TYPES)}"})

        try:
            file_data = base64.b64decode(data_b64)
        except Exception:
            return resp(400, {"error": "Некорректный base64"})

        max_size = 50 * 1024 * 1024
        if len(file_data) > max_size:
            return resp(400, {"error": "Файл слишком большой (макс. 50 МБ)"})

        media_kind, ext = ALLOWED_TYPES[content_type]
        key = f"media/{media_kind}/{uuid.uuid4()}.{ext}"

        s3().put_object(
            Bucket="files",
            Key=key,
            Body=file_data,
            ContentType=content_type,
        )

        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        return resp(200, {"url": cdn_url, "media_type": media_kind})

    except Exception as e:
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()
