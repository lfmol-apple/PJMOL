import os
from datetime import datetime
from typing import Iterable, List, Optional

import requests
from sqlalchemy.orm import Session

from app.models.usuario import Usuario

_MONITOR_IDS = {5, 8, 11}


def _normalize_phone(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not digits:
        return None
    if digits.startswith("55"):
        return digits
    if len(digits) in {10, 11, 12, 13}:
        return f"55{digits}"
    return digits


def get_monitor_recipients(db: Session) -> List[Usuario]:
    return (
        db.query(Usuario)
        .filter(Usuario.id.in_(_MONITOR_IDS))
        .order_by(Usuario.id.asc())
        .all()
    )


def _send_webhook(payload: dict) -> bool:
    url = os.getenv("LOGIN_NOTIFY_WEBHOOK_URL", "").strip()
    if not url:
        return False
    requests.post(url, json=payload, timeout=8)
    return True


def _send_whatsapp_cloud_message(phone: str, message: str) -> bool:
    token = os.getenv("WHATSAPP_CLOUD_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "").strip()
    if not token or not phone_number_id:
        return False

    url = f"https://graph.facebook.com/v22.0/{phone_number_id}/messages"
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        },
        timeout=8,
    )
    response.raise_for_status()
    return True


def notify_first_login_of_day(
    db: Session,
    *,
    usuario_id: int,
    nome: str,
    perfil: str,
    login_at: datetime,
) -> dict:
    recipients = get_monitor_recipients(db)
    hora = login_at.strftime("%H:%M")
    message = f"{nome} entrou no sistema às {hora}."
    payload = {
        "event": "user_first_login_of_day",
        "usuario_id": usuario_id,
        "nome": nome,
        "perfil": perfil,
        "login_at": login_at.isoformat(),
        "message": message,
        "recipients": [
            {
                "id": user.id,
                "nome": user.nome,
                "email": user.email,
                "telefone": _normalize_phone(user.telefone),
            }
            for user in recipients
        ],
    }

    sent_any = False
    errors: List[str] = []

    try:
        if _send_webhook(payload):
            sent_any = True
    except Exception as exc:
        errors.append(f"webhook: {exc}")

    for recipient in recipients:
        phone = _normalize_phone(recipient.telefone)
        if not phone:
            errors.append(f"usuario {recipient.id} sem telefone")
            continue
        try:
            if _send_whatsapp_cloud_message(phone, message):
                sent_any = True
        except Exception as exc:
            errors.append(f"whatsapp user={recipient.id}: {exc}")

    if not sent_any:
        print(f"[login-notify][dry-run] {payload}")

    return {
        "sent": sent_any,
        "errors": errors,
        "message": message,
    }
