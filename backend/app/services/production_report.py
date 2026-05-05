from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import Any, Iterable

from sqlalchemy.orm import Session, selectinload

from database import SessionLocal
from app.core.time import now_sp
from app.models.extrato import Extrato
from app.models.usuario import Usuario
from app.utils.mailer import send_email

ADMIN_IDS = {5, 8, 11}
FIXED_REPORT_RECIPIENTS = {
    "marcofariajunior@hotmail.com",
    "luanadsrocha12@gmail.com",
    "leonardofmol@gmail.com",
    "henriquefmol@gmail.com",
    "advmarcelmol@gmail.com",
    "breno.gontijo@yahoo.com.br",
}


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        raw = raw.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(raw)
        except Exception:
            return None
    return None


def _pick_extrato_date(extrato: Extrato) -> datetime | None:
    for candidate in (
        getattr(extrato, "criado_em", None),
        getattr(extrato, "created_at", None),
        getattr(extrato, "data_exportacao", None),
        getattr(extrato, "atualizado_em", None),
        getattr(extrato, "updated_at", None),
    ):
        parsed = _as_datetime(candidate)
        if parsed is not None:
            return parsed
    return None


def _normalize_status(extrato: Extrato) -> str:
    extras = getattr(extrato, "extras", None)
    if isinstance(extras, dict) and extras.get("signed_external") is True:
        return "Assinado (fora)"

    raw = (
        getattr(extrato, "status_documento", None)
        or getattr(extrato, "zapsign_status", None)
        or getattr(extrato, "status", None)
        or "Indefinido"
    )
    text = str(raw).strip().lower()
    if text in {"enviado", "enviada", "enviados", "sent", "enviado_para_assinatura"}:
        return "Enviado"
    if text in {"assinado", "assinada", "signed", "finalizado", "concluido", "concluído"}:
        return "Assinado"
    if text in {"assinado_externo", "assinado_fora", "assinatura_externa"}:
        return "Assinado (fora)"
    if text in {"cancelado", "rejeitado", "recusado"}:
        return "Cancelado"
    if text in {"salvo", "salva", "saved", "criado", "criada"}:
        return "Salvo"
    return str(raw).strip() or "Indefinido"


def _fmt_brl(value: float) -> str:
    formatted = f"{float(value or 0):,.2f}"
    return f"R$ {formatted}".replace(",", "#").replace(".", ",").replace("#", ".")


def _new_bucket(name: str | None = None) -> dict[str, Any]:
    return {
        "nome": name or "",
        "quantidade": 0,
        "valor_causa_total": 0.0,
        "acordo_provavel_total": 0.0,
    }


def _accumulate(bucket: dict[str, Any], valor_causa: float, acordo_provavel: float) -> None:
    bucket["quantidade"] += 1
    bucket["valor_causa_total"] += valor_causa
    bucket["acordo_provavel_total"] += acordo_provavel


def _serialize_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    return {
        **bucket,
        "valor_causa_total": round(bucket["valor_causa_total"], 2),
        "acordo_provavel_total": round(bucket["acordo_provavel_total"], 2),
        "valor_causa_total_fmt": _fmt_brl(bucket["valor_causa_total"]),
        "acordo_provavel_total_fmt": _fmt_brl(bucket["acordo_provavel_total"]),
    }


def _sum_buckets(*buckets: dict[str, Any] | None) -> dict[str, Any]:
    merged = _new_bucket()
    for bucket in buckets:
        if not bucket:
            continue
        merged["quantidade"] += int(bucket.get("quantidade", 0) or 0)
        merged["valor_causa_total"] += float(bucket.get("valor_causa_total", 0.0) or 0.0)
        merged["acordo_provavel_total"] += float(bucket.get("acordo_provavel_total", 0.0) or 0.0)
    return _serialize_bucket(merged)


def _normalize_email(value: Any) -> str | None:
    email = str(value or "").strip().lower()
    return email or None


def _append_recipient(target: list[dict[str, Any]], seen: set[str], *, email: Any, nome: str, recipient_id: int | None = None) -> None:
    normalized = _normalize_email(email)
    if not normalized or normalized in seen:
        return
    seen.add(normalized)
    target.append({"id": recipient_id, "nome": nome, "email": normalized})


def build_production_report(db: Session, start_date: date, end_date: date) -> dict[str, Any]:
    extratos = (
        db.query(Extrato)
        .options(selectinload(Extrato.usuario))
        .all()
    )

    period_start = datetime.combine(start_date, time.min)
    period_end = datetime.combine(end_date, time.max)

    geral = _new_bucket("Geral")
    geral_statuses: dict[str, dict[str, Any]] = defaultdict(lambda: _new_bucket())
    geral_administradoras: dict[str, dict[str, Any]] = {}
    gerentes: dict[int, dict[str, Any]] = {}
    active_manager_ids: set[int] = set()

    for extrato in extratos:
        extrato_dt = _pick_extrato_date(extrato)
        if extrato_dt is None or extrato_dt < period_start or extrato_dt > period_end:
            continue

        usuario = getattr(extrato, "usuario", None)
        gerente_id = getattr(extrato, "usuario_id", None)
        gerente_nome = getattr(usuario, "nome", None) or getattr(extrato, "gerente_nome", None) or (f"#{gerente_id}" if gerente_id else "Não informado")
        gerente_email = getattr(usuario, "email", None)
        administradora = (getattr(extrato, "administradora", None) or "Não informada").strip() or "Não informada"
        status = _normalize_status(extrato)
        valor_causa = float(getattr(extrato, "valor_causa", None) or 0.0)
        acordo_provavel = round(valor_causa * 0.7, 2)

        _accumulate(geral, valor_causa, acordo_provavel)
        _accumulate(geral_statuses[status], valor_causa, acordo_provavel)

        adm_bucket = geral_administradoras.setdefault(
            administradora,
            {
                **_new_bucket(administradora),
                "statuses": defaultdict(lambda: _new_bucket()),
            },
        )
        _accumulate(adm_bucket, valor_causa, acordo_provavel)
        _accumulate(adm_bucket["statuses"][status], valor_causa, acordo_provavel)

        if gerente_id not in gerentes:
            gerentes[gerente_id] = {
                "gerente_id": gerente_id,
                "gerente_nome": gerente_nome,
                "gerente_email": gerente_email,
                "totais": _new_bucket(gerente_nome),
                "statuses": defaultdict(lambda: _new_bucket()),
                "administradoras": {},
            }

        gerente_bucket = gerentes[gerente_id]
        active_manager_ids.add(gerente_id)
        _accumulate(gerente_bucket["totais"], valor_causa, acordo_provavel)
        _accumulate(gerente_bucket["statuses"][status], valor_causa, acordo_provavel)

        gerente_adm_bucket = gerente_bucket["administradoras"].setdefault(
            administradora,
            {
                **_new_bucket(administradora),
                "statuses": defaultdict(lambda: _new_bucket()),
            },
        )
        _accumulate(gerente_adm_bucket, valor_causa, acordo_provavel)
        _accumulate(gerente_adm_bucket["statuses"][status], valor_causa, acordo_provavel)

    usuarios = db.query(Usuario).all()
    admin_recipients = []
    manager_recipients = []
    admin_seen: set[str] = set()
    manager_seen: set[str] = set()
    for user in usuarios:
        perfil = str(getattr(user, "perfil", "") or "").strip().lower()
        is_admin = bool(getattr(user, "is_admin", False)) or perfil == "admin" or getattr(user, "id", None) in ADMIN_IDS
        if is_admin and getattr(user, "email", None):
            _append_recipient(admin_recipients, admin_seen, email=user.email, nome=user.nome, recipient_id=user.id)
        if getattr(user, "id", None) in active_manager_ids and getattr(user, "email", None):
            _append_recipient(manager_recipients, manager_seen, email=user.email, nome=user.nome, recipient_id=user.id)

    for email in sorted(FIXED_REPORT_RECIPIENTS):
        _append_recipient(admin_recipients, admin_seen, email=email, nome=email)

    serial_gerentes = []
    for gerente in sorted(gerentes.values(), key=lambda item: item["gerente_nome"].lower() if item["gerente_nome"] else ""):
        serial_gerentes.append(
            {
                "gerente_id": gerente["gerente_id"],
                "gerente_nome": gerente["gerente_nome"],
                "gerente_email": gerente["gerente_email"],
                "totais": _serialize_bucket(gerente["totais"]),
                "statuses": [
                    {"status": status, **_serialize_bucket(bucket)}
                    for status, bucket in sorted(gerente["statuses"].items(), key=lambda item: item[0].lower())
                ],
                "administradoras": [
                    {
                        "administradora": adm_name,
                        **_serialize_bucket(adm_bucket),
                        "statuses": [
                            {"status": status, **_serialize_bucket(status_bucket)}
                            for status, status_bucket in sorted(adm_bucket["statuses"].items(), key=lambda item: item[0].lower())
                        ],
                    }
                    for adm_name, adm_bucket in sorted(gerente["administradoras"].items(), key=lambda item: item[0].lower())
                ],
            }
        )

    enviados_bucket = _sum_buckets(
        geral_statuses.get("Enviado"),
        geral_statuses.get("Assinado"),
        geral_statuses.get("Assinado (fora)"),
    )
    aguardando_assinatura_bucket = _sum_buckets(geral_statuses.get("Enviado"))
    assinados_bucket = _sum_buckets(geral_statuses.get("Assinado"))
    assinados_fora_bucket = _sum_buckets(geral_statuses.get("Assinado (fora)"))

    return {
        "periodo": {
            "data_inicial": start_date.isoformat(),
            "data_final": end_date.isoformat(),
        },
        "totais": _serialize_bucket(geral),
        "resumo_assinaturas": {
            "enviados": enviados_bucket,
            "aguardando_assinatura": aguardando_assinatura_bucket,
            "assinados": assinados_bucket,
            "assinados_fora": assinados_fora_bucket,
        },
        "statuses": [
            {"status": status, **_serialize_bucket(bucket)}
            for status, bucket in sorted(geral_statuses.items(), key=lambda item: item[0].lower())
        ],
        "administradoras": [
            {
                "administradora": adm_name,
                **_serialize_bucket(adm_bucket),
                "statuses": [
                    {"status": status, **_serialize_bucket(status_bucket)}
                    for status, status_bucket in sorted(adm_bucket["statuses"].items(), key=lambda item: item[0].lower())
                ],
            }
            for adm_name, adm_bucket in sorted(geral_administradoras.items(), key=lambda item: item[0].lower())
        ],
        "gerentes": serial_gerentes,
        "recipients": {
            "admins": admin_recipients,
            "gerentes": manager_recipients,
        },
    }


def _render_status_rows(statuses: Iterable[dict[str, Any]]) -> str:
    rows = []
    for status_row in statuses:
        rows.append(
            "<tr>"
            f"<td style='padding:6px 8px;border:1px solid #dbe1ea'>{status_row['status']}</td>"
            f"<td style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>{status_row['quantidade']}</td>"
            f"<td style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>{status_row['valor_causa_total_fmt']}</td>"
            f"<td style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>{status_row['acordo_provavel_total_fmt']}</td>"
            "</tr>"
        )
    return "".join(rows)


def _render_admin_blocks(administradoras: Iterable[dict[str, Any]]) -> str:
    blocks = []
    for adm in administradoras:
        blocks.append(
            "<div style='margin:20px 0;padding:16px;border:1px solid #dbe1ea;border-radius:12px;background:#ffffff'>"
            f"<h3 style='margin:0 0 8px;font-size:16px;color:#0f172a'>{adm['administradora']}</h3>"
            f"<p style='margin:0 0 10px;color:#334155'>Total: <strong>{adm['quantidade']}</strong> processos | Valor da causa: <strong>{adm['valor_causa_total_fmt']}</strong> | Acordo provável: <strong>{adm['acordo_provavel_total_fmt']}</strong></p>"
            "<table style='width:100%;border-collapse:collapse;font-size:13px'>"
            "<thead><tr style='background:#f8fafc'><th style='padding:6px 8px;border:1px solid #dbe1ea;text-align:left'>Status</th><th style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>Qtd.</th><th style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>Valor da causa</th><th style='padding:6px 8px;border:1px solid #dbe1ea;text-align:right'>Acordo provável</th></tr></thead>"
            f"<tbody>{_render_status_rows(adm['statuses'])}</tbody>"
            "</table></div>"
        )
    return "".join(blocks)


def render_production_report_email(report: dict[str, Any]) -> str:
    manager_blocks = []
    for gerente in report["gerentes"]:
        manager_blocks.append(
            "<section style='margin:24px 0;padding:18px;border:1px solid #dbe1ea;border-radius:14px;background:#f8fafc'>"
            f"<h2 style='margin:0 0 10px;font-size:18px;color:#0f172a'>{gerente['gerente_nome']}</h2>"
            f"<p style='margin:0 0 12px;color:#334155'>Total do gerente: <strong>{gerente['totais']['quantidade']}</strong> processos | Valor da causa: <strong>{gerente['totais']['valor_causa_total_fmt']}</strong> | Acordo provável: <strong>{gerente['totais']['acordo_provavel_total_fmt']}</strong></p>"
            f"{_render_admin_blocks(gerente['administradoras'])}"
            "</section>"
        )

    periodo = report["periodo"]
    totais = report["totais"]
    resumo_assinaturas = report.get("resumo_assinaturas", {})
    enviados = resumo_assinaturas.get("enviados", _serialize_bucket(_new_bucket()))
    aguardando = resumo_assinaturas.get("aguardando_assinatura", _serialize_bucket(_new_bucket()))
    assinados = resumo_assinaturas.get("assinados", _serialize_bucket(_new_bucket()))
    assinados_fora = resumo_assinaturas.get("assinados_fora", _serialize_bucket(_new_bucket()))
    return (
        "<div style='font-family:Arial,sans-serif;color:#0f172a'>"
        "<h1 style='margin-bottom:8px'>Relatório Mensal de Produção</h1>"
        f"<p style='margin-top:0;color:#475569'>Período: <strong>{periodo['data_inicial']}</strong> a <strong>{periodo['data_final']}</strong></p>"
        f"<p style='color:#334155'>Total geral: <strong>{totais['quantidade']}</strong> processos | Valor da causa: <strong>{totais['valor_causa_total_fmt']}</strong> | Acordo provável: <strong>{totais['acordo_provavel_total_fmt']}</strong></p>"
        "<div style='margin:16px 0;padding:16px;border:1px solid #dbe1ea;border-radius:14px;background:#ffffff'>"
        "<h2 style='margin:0 0 12px;font-size:16px;color:#0f172a'>Resumo de envio e assinatura</h2>"
        f"<p style='margin:0 0 8px;color:#334155'><strong>Enviados:</strong> {enviados['quantidade']} | Valor da causa: {enviados['valor_causa_total_fmt']} | Acordo provável: {enviados['acordo_provavel_total_fmt']}</p>"
        f"<p style='margin:0 0 8px;color:#334155'><strong>Aguardando assinatura:</strong> {aguardando['quantidade']} | Valor da causa: {aguardando['valor_causa_total_fmt']} | Acordo provável: {aguardando['acordo_provavel_total_fmt']}</p>"
        f"<p style='margin:0 0 8px;color:#334155'><strong>Assinados:</strong> {assinados['quantidade']} | Valor da causa: {assinados['valor_causa_total_fmt']} | Acordo provável: {assinados['acordo_provavel_total_fmt']}</p>"
        f"<p style='margin:0;color:#334155'><strong>Assinados fora:</strong> {assinados_fora['quantidade']} | Valor da causa: {assinados_fora['valor_causa_total_fmt']} | Acordo provável: {assinados_fora['acordo_provavel_total_fmt']}</p>"
        "</div>"
        f"{''.join(manager_blocks) or '<p>Nenhum processo no período informado.</p>'}"
        "</div>"
    )


def send_monthly_production_report(db: Session, start_date: date, end_date: date) -> dict[str, Any]:
    report = build_production_report(db, start_date, end_date)
    recipients = {
        item["email"].strip().lower()
        for group in (report["recipients"]["admins"], report["recipients"]["gerentes"])
        for item in group
        if item.get("email")
    }
    if not recipients:
        return {"sent": False, "reason": "no-recipients", "report": report}

    body_html = render_production_report_email(report)
    assunto = f"Relatório mensal de produção | {start_date.isoformat()} a {end_date.isoformat()}"
    ok = send_email(subject=assunto, recipients=sorted(recipients), body_html=body_html)
    return {"sent": bool(ok), "recipient_count": len(recipients), "report": report}


def send_current_month_production_report() -> dict[str, Any]:
    now = now_sp()
    start_date = date(now.year, now.month, 1)
    end_date = now.date()
    db = SessionLocal()
    try:
        return send_monthly_production_report(db, start_date, end_date)
    finally:
        db.close()