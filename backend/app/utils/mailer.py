# app/utils/mailer.py
from __future__ import annotations

import os, smtplib, ssl, imaplib, re
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr, make_msgid, formatdate
from typing import Iterable, List, Optional, Union
from pathlib import Path

# =========================
# Carregamento do .env
# =========================
try:
    from dotenv import load_dotenv
except Exception:
    def load_dotenv(*a, **k):  # fallback inofensivo
        return False

def _load_env():
    """Tenta carregar o .env de locais prováveis (com ENV_PATH prioritário)."""
    env_path = os.getenv("ENV_PATH")
    if env_path and Path(env_path).is_file():
        load_dotenv(env_path); return

    fixed_paths = [
        Path("/var/www/pjmol/backend/app/.env"),
        Path("/root/projeto/backend/app/.env"),
        Path("/Users/leonardomol/Jao/105 19/backend/app/.env"),
    ]
    for fixed in fixed_paths:
        try:
            if fixed.is_file():
                load_dotenv(fixed)
                return
        except (PermissionError, OSError):
            continue

    here = Path(__file__).resolve()
    for p in [
        here.parents[3] / ".env",
        here.parents[2] / ".env",
        here.parents[2] / "app" / ".env",
        Path.cwd() / ".env",
    ]:
        if p.is_file():
            load_dotenv(p); return

_load_env()

# =========================
# Utilitários
# =========================
def _parse_bool(v, default: bool = False) -> bool:
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "t", "yes", "y", "on"}

def _to_list(v: Optional[Union[Iterable[str], str]]) -> List[str]:
    if v is None:
        return []
    if isinstance(v, str):
        v = v.replace(";", ",")
        return [s.strip() for s in v.split(",") if s.strip()]
    return [s.strip() for s in v if s and s.strip()]

def _get_smtp_cfg():
    host = os.getenv("SMTP_HOST", "")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except Exception:
        port = 587
    starttls = _parse_bool(os.getenv("SMTP_STARTTLS"), default=(port == 587))
    use_ssl  = _parse_bool(os.getenv("SMTP_SSL"),      default=(port == 465))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    mail_from = os.getenv("MAIL_FROM", username or "")
    mail_from_name = os.getenv("MAIL_FROM_NAME", "")
    # List-Unsubscribe (opcionais)
    list_unsub_url = os.getenv("LIST_UNSUB_URL", "").strip()
    list_unsub_mailto = os.getenv("LIST_UNSUB_MAILTO", "").strip()
    return dict(
        host=host, port=port, starttls=starttls, use_ssl=use_ssl,
        username=username, password=password,
        mail_from=mail_from, mail_from_name=mail_from_name,
        list_unsub_url=list_unsub_url, list_unsub_mailto=list_unsub_mailto,
    )

def _get_imap_cfg():
    return dict(
        save_sent=_parse_bool(os.getenv("MAIL_SAVE_SENT"), default=False),
        host=os.getenv("IMAP_HOST", "imap.hostinger.com"),
        port=int(os.getenv("IMAP_PORT", "993")),
        username=os.getenv("IMAP_USERNAME", os.getenv("SMTP_USERNAME", "")),
        password=os.getenv("IMAP_PASSWORD", os.getenv("SMTP_PASSWORD", "")),
        sent_folder=(os.getenv("IMAP_SENT_FOLDER") or "").strip()  # "", "auto", "Enviados", etc.
    )

def _make_from_header(email_addr: str, display_name: str) -> str:
    """Monta o From com codificação segura (RFC 2047) para nomes não-ASCII."""
    if display_name:
        name_hdr = str(Header(display_name, "utf-8"))
        return formataddr((name_hdr, email_addr))
    return email_addr

# =========================
# IMAP - salvar em "Enviados"
# =========================
_SENT_CANDIDATES = [
    # nomes mais comuns (pt/en)
    "Sent", "Enviados", "INBOX.Sent", "[Gmail]/Sent Mail",
    "E-mails enviados", "Correio enviado", "Sent Items", "Sent Messages",
    # variações extras comuns em provedores diversos
    "INBOX/Sent", "mail/Sent", "Outbox.Sent", "Sentbox", "Enviar",
    # minúsculas (alguns servidores retornam assim)
    "sent", "enviados",
]

_QUOTED_FOLDER_RE = re.compile(r'"([^"]+)"\s*$')

def _extract_box_name(line: bytes) -> str:
    """
    Extrai o nome da pasta de uma linha do IMAP LIST.
    Ex.: b'(\\HasNoChildren) "/" "Sent"' -> "Sent"
    Fallback: última palavra sem aspas.
    """
    try:
        s = line.decode(errors="ignore")
        m = _QUOTED_FOLDER_RE.search(s)
        if m:
            return m.group(1)
        parts = s.split()
        return parts[-1].strip('"')
    except Exception:
        return ""

def _append_to_sent_imap(raw_msg: bytes) -> bool:
    """
    Salva a mensagem crua (RFC822) na pasta de enviados via IMAP.
    Retorna True/False. Não lança exceção (apenas loga).
    """
    imcfg = _get_imap_cfg()
    if not imcfg["save_sent"]:
        return False

    if not imcfg["username"] or not imcfg["password"]:
        print("[mailer] aviso: MAIL_SAVE_SENT=true, mas IMAP_USERNAME/IMAP_PASSWORD não fornecidos.")
        return False

    try:
        M = imaplib.IMAP4_SSL(imcfg["host"], imcfg["port"])
        M.login(imcfg["username"], imcfg["password"])

        # stamp timezone-aware (UTC) evita erros “date_time must be aware”
        stamp = imaplib.Time2Internaldate(datetime.now(timezone.utc))
        flags = r"(\Seen)"

        # 1) Se o usuário fixou uma pasta (e não 'auto'), tentar direto
        folder_env = imcfg["sent_folder"]
        if folder_env and folder_env.lower() not in {"auto", "automatico", "automático"}:
            status, _ = M.append(folder_env, flags, stamp, raw_msg)
            if status == "OK":
                print(f"[mailer] salvo em Enviados via IMAP: {folder_env}")
                M.logout()
                return True
            else:
                print(f"[mailer] aviso: falha ao salvar em Enviados (IMAP em '{folder_env}'). Tentando auto.")

        # 2) Auto-detecção
        status, boxes = M.list()
        if status != "OK" or not boxes:
            print("[mailer] aviso: IMAP LIST falhou para auto detecção de Enviados.")
            M.logout()
            return False

        box_names = [_extract_box_name(b) for b in boxes if b]
        # ordenar: candidatos conhecidos primeiro, depois quaisquer pastas que contenham 'sent'/'env' no nome
        preferred = [c for c in _SENT_CANDIDATES if c in box_names]
        preferred_lower = set(x.lower() for x in preferred)
        heuristics = [n for n in box_names if n.lower() not in preferred_lower
                      and (("sent" in n.lower()) or ("envi" in n.lower()))]
        ordered = preferred + heuristics + [n for n in box_names if n not in preferred and n not in heuristics]

        tried: List[str] = []
        for folder in ordered:
            tried.append(folder)
            status, _ = M.append(folder, flags, stamp, raw_msg)
            if status == "OK":
                print(f"[mailer] salvo em Enviados via IMAP: {folder}")
                M.logout()
                return True

        print(f"[mailer] aviso: falha ao salvar em Enviados (IMAP). Tentativas: {', '.join(tried) if tried else '(nenhuma)'}")
        M.logout()
        return False

    except imaplib.IMAP4.error as e:
        print(f"[mailer] aviso: falha ao salvar em Enviados (IMAP): {e}")
        return False
    except Exception as e:
        print(f"[mailer] aviso: erro genérico ao salvar em Enviados (IMAP): {e}")
        return False

# =========================
# Envio (API pública)
# =========================
def send_email(
    subject: str,
    recipients: Union[Iterable[str], str] = None,
    body_text: Optional[str] = None,
    body_html: Optional[str] = None,
    cc: Optional[Union[Iterable[str], str]] = None,
    bcc: Optional[Union[Iterable[str], str]] = None,
    **legacy_kwargs  # compat: to=, html=, body=
) -> bool:
    """
    Envia e-mail via SMTP e, se configurado, salva cópia em 'Enviados' via IMAP.

    Compatibilidade:
      - to=  -> recipients
      - html -> body_html
      - body -> body_text
    """
    # compat antigo
    if recipients is None and "to" in legacy_kwargs:
        recipients = legacy_kwargs.pop("to")
    if body_html is None and "html" in legacy_kwargs:
        body_html = legacy_kwargs.pop("html")
    if body_text is None and "body" in legacy_kwargs:
        body_text = legacy_kwargs.pop("body")

    cfg = _get_smtp_cfg()
    if not cfg["username"] or not cfg["password"]:
        print("[mailer] erro: SMTP_USERNAME/SMTP_PASSWORD não configurados no ambiente."); return False
    if not cfg["host"] or not cfg["port"]:
        print("[mailer] erro: SMTP_HOST/SMTP_PORT ausentes."); return False

    to_list = _to_list(recipients)
    cc_list = _to_list(cc)
    bcc_list = _to_list(bcc)
    all_rcpts = list({*to_list, *cc_list, *bcc_list})
    if not all_rcpts:
        print("[mailer] aviso: nenhum destinatário definido."); return False

    # Mensagem multipart/alternative
    msg = MIMEMultipart("alternative")

    # From + Reply-To (RFC 2047 safe)
    msg["From"] = _make_from_header(cfg["mail_from"], cfg["mail_from_name"] or "")
    msg["Reply-To"] = msg["From"]

    # To / Cc
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)

    # Assunto (RFC 2047 seguro)
    msg["Subject"] = str(Header(subject or "", "utf-8"))

    # Cabeçalhos essenciais
    msg["Date"] = formatdate(localtime=True)
    domain = cfg["mail_from"].split("@")[-1] if "@" in cfg["mail_from"] else None
    msg["Message-ID"] = make_msgid(domain=domain)

    # List-Unsubscribe (opcional – ajuda entregabilidade)
    lu = []
    if cfg.get("list_unsub_url"):
        lu.append(f"<{cfg['list_unsub_url']}>")
    if cfg.get("list_unsub_mailto"):
        lu.append(f"<{cfg['list_unsub_mailto']}>")
    if lu:
        msg["List-Unsubscribe"] = ", ".join(lu)
        # One-Click (Gmail/Yahoo)
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    # Corpo
    has_any = False
    if body_text:
        msg.attach(MIMEText(body_text, "plain", "utf-8")); has_any = True
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8")); has_any = True
    if not has_any:
        msg.attach(MIMEText("(sem conteúdo)", "plain", "utf-8"))

    # Enviar
    try:
        raw = msg.as_string()
        if cfg["use_ssl"]:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ssl.create_default_context(), timeout=30) as s:
                s.login(cfg["username"], cfg["password"])
                s.sendmail(cfg["mail_from"], all_rcpts, raw)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as s:
                s.ehlo()
                if cfg["starttls"]:
                    s.starttls(context=ssl.create_default_context()); s.ehlo()
                s.login(cfg["username"], cfg["password"])
                s.sendmail(cfg["mail_from"], all_rcpts, raw)

        print(
            f"[mailer] enviado: to={to_list} cc={cc_list} bcc={len(bcc_list)} "
            f"via {cfg['host']}:{cfg['port']} "
            f"{'SSL' if cfg['use_ssl'] else ('STARTTLS' if cfg['starttls'] else 'PLAIN')}"
        )
        # salvar em Enviados (não interrompe o fluxo se falhar)
        _append_to_sent_imap(msg.as_bytes())
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"[mailer] auth error ({cfg['host']}:{cfg['port']}): {e}"); return False
    except smtplib.SMTPResponseException as e:
        print(f"[mailer] smtp error {getattr(e, 'smtp_code', '?')}: {getattr(e, 'smtp_error', e)}"); return False
    except Exception as e:
        print(f"[mailer] erro geral ao enviar ({cfg['host']}:{cfg['port']}): {e}"); return False
