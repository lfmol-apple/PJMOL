from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from app.models.push_subscription import PushSubscription
from app.services.push_notifications import MONITOR_IDS, get_vapid_public_key, notify_monitors_about_login, push_is_configured

router = APIRouter(prefix="/push", tags=["Push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushTestPayload(BaseModel):
    nome: str = "Teste"
    login_at_iso: str


def _get_uid(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> Optional[int]:
    if not x_usuario_id:
        return None
    try:
        return int(x_usuario_id)
    except Exception:
        return None


@router.get("/public-key")
def public_key(uid: Optional[int] = Depends(_get_uid)):
    if uid not in MONITOR_IDS:
        raise HTTPException(status_code=403, detail="Push restrito aos administradores autorizados.")
    key = get_vapid_public_key()
    if not key:
        raise HTTPException(status_code=503, detail="Push ainda não configurado.")
    return {"public_key": key}


@router.post("/subscribe")
def subscribe(
    payload: PushSubscriptionIn,
    request: Request,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_get_uid),
):
    if uid not in MONITOR_IDS:
        raise HTTPException(status_code=403, detail="Push restrito aos administradores autorizados.")

    row = db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).first()
    if not row:
        row = PushSubscription(
            user_id=uid,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=request.headers.get("user-agent", "")[:500],
            active=True,
        )
        db.add(row)
    else:
        row.user_id = uid
        row.p256dh = payload.keys.p256dh
        row.auth = payload.keys.auth
        row.user_agent = request.headers.get("user-agent", "")[:500]
        row.active = True
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(
    payload: PushSubscriptionIn,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_get_uid),
):
    if uid not in MONITOR_IDS:
        raise HTTPException(status_code=403, detail="Push restrito aos administradores autorizados.")

    row = db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).first()
    if row:
        row.active = False
        db.commit()
    return {"ok": True}


@router.post("/test")
def send_test(
    payload: PushTestPayload,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_get_uid),
):
    if uid not in MONITOR_IDS:
        raise HTTPException(status_code=403, detail="Push restrito aos administradores autorizados.")
    return notify_monitors_about_login(db, nome=payload.nome, login_at_iso=payload.login_at_iso, actor_user_id=-1)
