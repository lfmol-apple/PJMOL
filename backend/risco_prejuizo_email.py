#!/usr/bin/env python3
"""
Envia relatório diário de risco de prejuízo para admins às 9:10h.
Agrupado por responsável, com subtotal por seção.
"""
import sys, os, sqlite3, argparse
from datetime import datetime, timezone, timedelta

# Garante que o módulo mailer seja encontrado
sys.path.insert(0, "/var/www/pjmol/backend")
sys.path.insert(0, "/var/www/pjmol/backend/app")

DB_PATH = "/var/www/pjmol/backend/app/database.db"
ADMIN_IDS = {5, 8, 11}  # Leonardo, Henrique

def fmt_brl(v):
    v = float(v or 0)
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def fmt_date(s):
    if not s:
        return "—"
    try:
        s = str(s)[:10]
        d = datetime.strptime(s[:10], "%Y-%m-%d")
        return d.strftime("%d/%m/%Y")
    except Exception:
        return str(s)[:10]

def fmt_phone(tel):
    if not tel:
        return ""
    d = "".join(c for c in str(tel) if c.isdigit())
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return tel

def dias_label(n):
    if n == 1:
        return "1 dia"
    return f"{n} dias"

def get_overdue_extratos():
    """Retorna extratos Enviado há mais de 24h sem assinatura."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    # 24h atrás em UTC
    limite = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        SELECT
            e.id,
            e.nome_cliente,
            e.telefone,
            e.administradora,
            e.grupo,
            e.cota,
            e.valor_causa,
            e.enviado_em,
            e.usuario_id,
            u.nome AS gerente_nome,
            u.email AS gerente_email,
            u.nome AS usuario_nome
        FROM extratos e
        LEFT JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.enviado_em IS NOT NULL
          AND e.enviado_em < ?
          AND LOWER(COALESCE(e.status_documento, e.zapsign_status, ''))
              IN ('enviado', 'enviada', 'enviados', 'sent', 'enviado_para_assinatura')
          AND (e.zapsign_signed_at IS NULL OR e.zapsign_signed_at = '')
        ORDER BY e.enviado_em ASC
    """, (limite,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Filtra extras.assinado_fora se possível (ignora silenciosamente erros de parse)
    import json
    def is_assinado_fora(row):
        try:
            ex = json.loads(row.get("extras") or "{}")
            return bool(ex.get("assinado_fora"))
        except Exception:
            return False

    return [r for r in rows if not is_assinado_fora(r)]

def calcular_dias(enviado_em_str):
    if not enviado_em_str:
        return 0
    try:
        s = str(enviado_em_str).replace(" ", "T")
        if not s.endswith("Z") and "+" not in s and len(s) > 19:
            s = s[:19]
        d = datetime.fromisoformat(s.rstrip("Z"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        diff = datetime.now(timezone.utc) - d
        return max(0, int(diff.total_seconds() // 86400))
    except Exception:
        return 0

def html_card_gerente(row):
    dias = calcular_dias(row["enviado_em"])
    tel_raw = str(row.get("telefone") or "").strip()
    tel_fmt = fmt_phone(tel_raw)
    tel_html = (
        f'<a href="tel:{tel_raw.replace(" ","")}" style="color:#1d4ed8;text-decoration:none">📞 {tel_fmt}</a>'
        if tel_fmt else '<span style="color:#94a3b8;font-style:italic">Telefone não cadastrado</span>'
    )
    vc = fmt_brl(row.get("valor_causa") or 0)
    grupo = row.get("grupo") or ""
    cota = row.get("cota") or ""
    gc = ""
    if grupo or cota:
        gc = ("Grupo " + grupo if grupo else "") + (" / " if grupo and cota else "") + ("Cota " + cota if cota else "")
    adm = row.get("administradora") or ""
    enviado = fmt_date(str(row.get("enviado_em",""))[:10])

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fca5a5;border-radius:8px;margin-bottom:14px;border-collapse:separate;border-spacing:0;overflow:hidden">
  <tr>
    <td style="background:#fff5f5;padding:10px 16px;border-bottom:1px solid #fee2e2">
      <span style="font-size:15px;font-weight:700;color:#1e293b">{row.get('nome_cliente','—')}</span>
      &nbsp;
      <span style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700">{dias_label(dias)} sem assinar</span>
    </td>
  </tr>
  <tr>
    <td style="background:white;padding:10px 16px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#475569;padding:2px 0;width:50%">{tel_html}</td>
          <td style="font-size:12px;color:#64748b;padding:2px 0">{adm}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#475569;padding:2px 0"><strong style="color:#1e293b">{vc}</strong></td>
          <td style="font-size:12px;color:#94a3b8;padding:2px 0">{gc if gc else "&nbsp;"}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:11px;color:#94a3b8;padding-top:4px">#{row.get('id','')} &middot; Enviado {enviado}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""

def html_card_admin(row):
    dias = calcular_dias(row["enviado_em"])
    gerente = row.get("gerente_nome") or row.get("usuario_nome") or "—"
    tel_raw = str(row.get("telefone") or "").strip()
    tel_fmt = fmt_phone(tel_raw)
    tel_html = (
        f'<a href="tel:{tel_raw.replace(" ","")}" style="color:#1d4ed8;text-decoration:none">📞 {tel_fmt}</a>'
        if tel_fmt else '<span style="color:#94a3b8;font-style:italic">sem telefone</span>'
    )
    vc = fmt_brl(row.get("valor_causa") or 0)
    grupo = row.get("grupo") or ""
    cota = row.get("cota") or ""
    gc = ""
    if grupo or cota:
        gc = ("Grupo " + grupo if grupo else "") + (" / " if grupo and cota else "") + ("Cota " + cota if cota else "")
    adm = row.get("administradora") or ""
    enviado = fmt_date(str(row.get("enviado_em",""))[:10])

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fde68a;border-radius:8px;margin-bottom:12px;border-collapse:separate;border-spacing:0;overflow:hidden">
  <tr>
    <td style="background:#fffbeb;padding:10px 16px;border-bottom:1px solid #fef3c7">
      <span style="font-size:14px;font-weight:700;color:#1e293b">{row.get('nome_cliente','—')}</span>
      &nbsp;
      <span style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">{dias_label(dias)} sem assinar</span>
      &nbsp;
      <span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">👤 {gerente}</span>
    </td>
  </tr>
  <tr>
    <td style="background:white;padding:10px 16px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;padding:2px 0;width:50%">{tel_html}</td>
          <td style="font-size:12px;color:#64748b;padding:2px 0">{adm}</td>
        </tr>
        <tr>
          <td style="font-size:12px;padding:2px 0"><strong style="color:#1e293b">{vc}</strong></td>
          <td style="font-size:12px;color:#94a3b8;padding:2px 0">{gc if gc else "&nbsp;"}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:11px;color:#94a3b8;padding-top:4px">#{row.get('id','')} &middot; Enviado {enviado}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""

def build_html_gerente(nome, rows):
    total = sum(float(r.get("valor_causa") or 0) for r in rows)
    cards = "".join(html_card_gerente(r) for r in rows)
    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:680px;margin:0 auto;padding:20px">
<div style="background:#dc2626;border-radius:12px;padding:20px 24px;margin-bottom:20px">
  <h1 style="color:white;margin:0;font-size:20px">🔴 Risco de Prejuízo — PJMOL</h1>
  <p style="color:#fca5a5;margin:6px 0 0">{nome} — {len(rows)} extrato{"s" if len(rows)!=1 else ""} sem assinatura há mais de 24h</p>
</div>
<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
  <span style="font-size:13px;color:#7f1d1d;font-weight:600">Total em risco</span>
  <span style="font-size:22px;font-weight:900;color:#dc2626">{fmt_brl(total)}</span>
</div>
<p style="font-size:13px;color:#475569;margin-bottom:20px">
  Estes clientes ainda não assinaram o documento enviado. Ligue para cada um e solicite a assinatura.<br>
  Assim que o status mudar para <strong>Assinado</strong>, o processo voltará a ser computado nos seus resultados.
</p>
{cards}
<p style="margin-top:24px;font-size:11px;color:#94a3b8;text-align:center">PJMOL — Relatório automático diário • {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
</body></html>"""

def build_html_admin(rows):
    from collections import defaultdict, OrderedDict
    total = sum(float(r.get("valor_causa") or 0) for r in rows)

    # Agrupa por gerente, ordenado pelo maior subtotal
    grupos: dict = defaultdict(list)
    for r in rows:
        gerente = r.get("gerente_nome") or r.get("usuario_nome") or "Sem responsável"
        grupos[gerente].append(r)
    grupos_sorted = sorted(
        grupos.items(),
        key=lambda kv: sum(float(r.get("valor_causa") or 0) for r in kv[1]),
        reverse=True,
    )

    secoes_html = ""
    for gerente, g_rows in grupos_sorted:
        subtotal = sum(float(r.get("valor_causa") or 0) for r in g_rows)
        cards = "".join(html_card_admin(r) for r in g_rows)
        secoes_html += f"""
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="background:#1e293b;border-radius:8px 8px 0 0;padding:10px 16px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:white;font-size:14px;font-weight:700">&#128100; {gerente}
            <span style="background:#dc2626;color:white;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px">{len(g_rows)} processo{"s" if len(g_rows)!=1 else ""}</span>
          </td>
          <td style="text-align:right">
            <span style="font-size:11px;color:#94a3b8">Subtotal em risco</span><br>
            <span style="font-size:15px;font-weight:900;color:#fbbf24">{fmt_brl(subtotal)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 0 0">
      {cards}
    </td>
  </tr>
</table>"""

    return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:680px;margin:0 auto;padding:20px">
<div style="background:#7c2d12;border-radius:12px;padding:20px 24px;margin-bottom:20px">
  <h1 style="color:white;margin:0;font-size:20px">&#128308; Risco de Prejuízo — PJMOL</h1>
  <p style="color:#fdba74;margin:6px 0 0">{len(rows)} extrato{"s" if len(rows)!=1 else ""} sem assinatura há mais de 24h</p>
</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;margin-bottom:24px">
  <tr>
    <td style="padding:14px 18px;font-size:13px;color:#7c2d12;font-weight:600">Total geral em risco</td>
    <td style="padding:14px 18px;text-align:right;font-size:22px;font-weight:900;color:#c2410c">{fmt_brl(total)}</td>
  </tr>
</table>
{secoes_html}
<p style="margin-top:24px;font-size:11px;color:#94a3b8;text-align:center">PJMOL — Relatório automático diário • {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
</body></html>"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        from app.utils.mailer import send_email
    except ImportError:
        print("[erro] Não foi possível importar mailer.")
        sys.exit(1)

    rows = get_overdue_extratos()
    if not rows:
        print("[info] Nenhum extrato em risco. Emails não enviados.")
        return

    total = sum(float(r.get("valor_causa") or 0) for r in rows)

    # ── 1) Admins: visão consolidada com todos os processos agrupados ──────────
    html_adm = build_html_admin(rows)
    subj_adm = f"🔴 PJMOL — Risco de Prejuízo: {len(rows)} extratos sem assinatura ({fmt_brl(total)})"

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT email FROM usuarios WHERE id IN (5,8,11) AND email IS NOT NULL AND email != ''")
    admin_emails = [r[0] for r in cur.fetchall()]
    conn.close()

    if args.dry_run:
        print(f"[dry-run] ADMIN → {admin_emails} | {len(rows)} extratos | {fmt_brl(total)}")
    else:
        ok = send_email(subject=subj_adm, recipients=admin_emails, body_html=html_adm)
        print(f"[{'OK' if ok else 'ERRO'}] ADMIN → {admin_emails} — {len(rows)} extratos, {fmt_brl(total)}")

    # ── 2) Gerentes: cada um recebe só os seus processos ──────────────────────
    from collections import defaultdict
    por_usuario: dict = defaultdict(list)
    for r in rows:
        uid = r.get("usuario_id")
        if uid in ADMIN_IDS:   # admins já receberam o consolidado
            continue
        por_usuario[uid].append(r)

    conn2 = sqlite3.connect(DB_PATH)
    conn2.row_factory = sqlite3.Row
    cur2 = conn2.cursor()

    for uid, g_rows in por_usuario.items():
        cur2.execute("SELECT nome, email FROM usuarios WHERE id = ?", (uid,))
        user = cur2.fetchone()
        if not user or not user["email"]:
            print(f"[aviso] usuario_id={uid} sem email, pulando")
            continue

        nome  = user["nome"]
        email = user["email"]
        g_total = sum(float(r.get("valor_causa") or 0) for r in g_rows)
        html_g  = build_html_gerente(nome, g_rows)
        subj_g  = f"🔴 Risco de Prejuízo: {len(g_rows)} extrato{'s' if len(g_rows)!=1 else ''} aguardando assinatura ({fmt_brl(g_total)})"

        if args.dry_run:
            print(f"[dry-run] GERENTE {nome} <{email}> — {len(g_rows)} extratos, {fmt_brl(g_total)}")
            continue

        ok = send_email(subject=subj_g, recipients=email, body_html=html_g)
        print(f"[{'OK' if ok else 'ERRO'}] GERENTE {nome} <{email}> — {len(g_rows)} extratos")

    conn2.close()

if __name__ == "__main__":
    main()
