import json
import os
from typing import Iterable, List

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from app.models.push_subscription import PushSubscription

MONITOR_IDS = {5, 8, 11}


def _format_currency(value: float | None) -> str:
    if value is None:
        return "Nao informado"
    formatted = f"{value:,.2f}"
    return f"R$ {formatted}".replace(",", "#").replace(".", ",").replace("#", ".")


def get_vapid_public_key() -> str:
    return os.getenv("PUSH_VAPID_PUBLIC_KEY", "").strip()


def _get_vapid_private_key() -> str:
    return os.getenv("PUSH_VAPID_PRIVATE_KEY", "").strip()


def _get_vapid_claims() -> dict:
    subject = os.getenv("PUSH_VAPID_SUBJECT", "mailto:gerenciamento@pjmol.com.br").strip()
    return {"sub": subject}


def push_is_configured() -> bool:
    return bool(get_vapid_public_key() and _get_vapid_private_key())


def get_monitor_subscriptions(db: Session) -> List[PushSubscription]:
    return (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id.in_(MONITOR_IDS), PushSubscription.active == True)
        .all()
    )


def _send_push_payload(db: Session, payload: dict) -> dict:
    subscriptions = get_monitor_subscriptions(db)
    if not subscriptions:
        return {"sent": False, "reason": "no-subscriptions"}
    if not push_is_configured():
        return {"sent": False, "reason": "push-not-configured"}

    sent = 0
    errors: List[str] = []
    for subscription in subscriptions:
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=_get_vapid_private_key(),
                vapid_claims=_get_vapid_claims(),
            )
            sent += 1
        except WebPushException as exc:
            errors.append(f"subscription={subscription.id}: {exc}")
            if getattr(exc, "response", None) is not None and exc.response.status_code in {404, 410}:
                subscription.active = False
        except Exception as exc:
            errors.append(f"subscription={subscription.id}: {exc}")
    db.commit()
    return {"sent": sent > 0, "sent_count": sent, "errors": errors}


def notify_monitors_about_login(db: Session, *, nome: str, login_at_iso: str, actor_user_id: int) -> dict:
    payload = {
        "title": "Novo login no sistema",
        "body": f"{nome} entrou no sistema às {login_at_iso[11:16]}",
        "url": "/gerencial/sessoes",
        "tag": f"login-{actor_user_id}-{login_at_iso[:19]}",
    }

    return _send_push_payload(db, payload)



def notify_monitors_about_new_process(
    db: Session,
    *,
    extrato_id: int,
    nome_cliente: str,
    administradora: str,
    valor_causa: float | None,
    gerente_nome: str | None,
) -> dict:
    gerente = (gerente_nome or "Nao informado").strip() or "Nao informado"
    valor_formatado = _format_currency(valor_causa)
    payload = {
        "title": f"💵 {valor_formatado}",
        "body": (
            f"{gerente} cadastrou um novo processo\n"
            f"Cliente: {nome_cliente}\n"
            f"Administradora: {administradora}\n"
            f"Valor da causa: {valor_formatado}\n"
            f"Gerente: {gerente}"
        ),
        "url": "/gerencial/processos",
        "tag": f"processo-{extrato_id}",
        "icon": "/dollar-green-badge.svg",
        "badge": "/dollar-green-badge.svg",
        "silent": False,
        "requireInteraction": True,
        "vibrate": [200, 120, 200, 120, 320],
        "actions": [
            {"action": "open-process", "title": "Abrir processo"},
        ],
    }
    return _send_push_payload(db, payload)
