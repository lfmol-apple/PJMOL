// @ts-nocheck
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

/* ===== helpers ===== */
function pickFromCookies(keys: string[]): string | null {
  const cookie = typeof document !== 'undefined' ? document.cookie || '' : '';
  for (const k of keys) {
    const m = cookie.match(new RegExp(`(?:^|; )${k}=([^;]+)`));
    if (m) {
      const v = decodeURIComponent(m[1]);
      return v.startsWith('Bearer ') ? v.replace(/^Bearer\s+/, '') : v;
    }
  }
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
function getToken(): string | null {
  const keys = ['token','access_token','accessToken','jwt','authToken','Authorization','authorization'];
  const stores = [typeof localStorage !== 'undefined' ? localStorage : null,
                  typeof sessionStorage !== 'undefined' ? sessionStorage : null].filter(Boolean) as Storage[];
  for (const store of stores) {
    for (const k of keys) {
      const raw = store.getItem(k);
      if (raw) return raw.startsWith('Bearer ') ? raw.replace(/^Bearer\s+/, '') : raw;
    }
  }
  return pickFromCookies(keys);
}
async function fetchJSON(url: string, headers: Record<string,string>) {
  try {
    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
// Prefer IPv4 loopback by default to avoid browser attempting ::1 (IPv6) which
// can cause timeouts when the backend is bound only to 127.0.0.1.
const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://127.0.0.1:8000"
).replace(/\/$/, '');
const API = (
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, '');

/* ===== Tipos ===== */
type StatusResp = {
  ok: boolean;
  extrato_id?: number;
  timer_frozen?: boolean;
  itens?: Array<{
    tipo: string;
    url: string;
  }>;
  timers?: {
    assinatura?: { started_at: string | null; ended_at: string | null; active: boolean };
    anexos?: { started_at: string | null; ended_at: string | null; active: boolean };
    advogado?: { started_at: string | null; ended_at: string | null; active: boolean };
  };
  // Backward compatibility - manter os campos antigos por enquanto
  minimos?: {
    endereco_ok: boolean;
    identidade_ok: boolean;
    modo_identidade: 'arquivo' | 'incompleto' | 'completo' | 'frente_verso';
    ok: boolean;
  };
  from_filesystem?: {
    extrato_original: string[];
    comprovante_endereco: string[];
    comprovante_renda: string[];
    documento_identidade: string[] | { lista?: string[]; completo?: string[] };
    outros: string[];
  };
  from_db?: any;
};
type BusyKey = string | null;

function collectStrings(...items: any[]): string[] {
  const bag: string[] = [];
  const pushVal = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) val.forEach(pushVal);
    else if (typeof val === "object") Object.values(val).forEach(pushVal);
    else if (typeof val === "string" && val.trim()) bag.push(val.trim());
  };
  items.forEach(pushVal);
  return bag;
}

function formatDateTime(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ', ' + d.toLocaleTimeString('pt-BR', { hour12: false });
  } catch { return iso; }
}

/* ===== Tarja topo ===== */
function TarjaInline() {
  const [nome, setNome] = useState<string>("");
  const [perfil, setPerfil] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const read = (k: string) => (typeof window !== "undefined" ? (localStorage.getItem(k) || sessionStorage.getItem(k)) : null);
      const nomeAdv = read("nomeAdvogado") || "";
      const nomeUser = read("nomeUsuario") || "";
      const nomeExib = (nomeAdv || nomeUser || "").toString();
      const perfilRaw = ((read("perfil") || read("perfilUsuario") || read("role") || read("papel") || read("tipo") || read("nivel") || "") + "").toLowerCase();
      setNome(nomeExib || "Usuário");
      setPerfil(perfilRaw || "usuario");
    } catch {}
  }, []);

  if (!hydrated) return null;

  const isGerente = perfil === "gerente" || perfil === "admin";

  const sair = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = "usuario=; Max-Age=0; path=/";
      document.cookie = "token=; Max-Age=0; path=/";
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="w-full border rounded-2xl px-3 py-2 bg-gray-50 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-200">👤</span>
        <div className="truncate font-semibold text-black">{nome}</div>
        {perfil && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-amber-700 border border-amber-300">
            {perfil.charAt(0).toUpperCase() + perfil.slice(1)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isGerente && (
          <a
            href="/gerencial/processos"
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            Gerenciar processos
          </a>
        )}
        <button
          onClick={sair}
          className="px-3 py-1.5 rounded-lg bg-white text-red-600 text-sm font-semibold border border-red-200 hover:bg-red-50"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/* ===== Card persistente (BD) para status/envios) ===== */
function AdvogadoStatusCard({
  lastTo, lastName, lastAt, history
}: {
  lastTo?: string; lastName?: string; lastAt?: string;
  history: Array<{to?: string; name?: string; at?: string; by_user_id?: number}>;
}) {
  const ordered = Array.isArray(history)
    ? [...history].sort((a,b)=>Date.parse(b?.at||'0')-Date.parse(a?.at||'0'))
    : [];

  const top5 = ordered.slice(0, 5);
  const fallback = top5[0] || {};
  const _lastTo = lastTo || fallback.to || '';
  const _lastName = lastName || fallback.name || '';
  const _lastAt = lastAt || fallback.at || '';

  const alreadySent = !!(_lastAt || _lastTo || _lastName || top5.length);
  const prev = top5.slice(1);

  const tone = alreadySent
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
    : 'border-rose-300 bg-rose-50 text-rose-900';

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="font-semibold text-sm mb-2">Envio ao Advogado</div>

      {alreadySent ? (
        <>
          {/* Último envio - sem truncar */}
          <div className="text-[13px] leading-snug space-y-1">
            <div>
              <span className="opacity-70">Último:&nbsp;</span>
              <b className="font-semibold">{_lastName || '—'}</b>
            </div>
            {_lastTo && (
              <div className="break-words">
                <span className="opacity-70">E-mail:&nbsp;</span>
                <span title={_lastTo} className="underline decoration-dotted">
                  &lt;{_lastTo}&gt;
                </span>
              </div>
            )}
            <div>
              <span className="opacity-70">Quando:&nbsp;</span>
              <span>{formatDateTime(_lastAt)}</span>
            </div>
          </div>

          {/* Histórico anterior (até 5) — altura maior e sem ellipsis */}
          {prev.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] font-semibold opacity-90 mb-2">
                Envios anteriores (até 5)
              </div>
              <ul className="space-y-2 max-h-72 overflow-auto pr-2">
                {prev.map((h, i) => (
                  <li
                    key={`prev-${i}`}
                    className="text-[12px] leading-snug"
                    title={`${h.name || ''} ${h.to ? `<${h.to}>` : ''} — ${formatDateTime(h.at)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-[3px]">•</span>
                      <div className="min-w-0">
                        <div className="font-medium">{h.name || '—'}</div>
                        {h.to && (
                          <div className="break-words">
                            <span className="opacity-70">E-mail:&nbsp;</span>
                            <span className="underline decoration-dotted">&lt;{h.to}&gt;</span>
                          </div>
                        )}
                        <div className="opacity-80">{formatDateTime(h.at)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="text-[12px]">Ainda <b>não foi enviado</b> e-mail ao advogado.</div>
      )}
    </div>
  );
}

function PageContent() {
  const router = useRouter();
  const params = useParams<{ extratoId?: string }>();
  const rawExtratoId = (params?.extratoId || params?.id || '').toString();
  const extratoId = (rawExtratoId.match(/\d+/)?.[0] || rawExtratoId).toString();

  const search = useSearchParams();
  const uidQS = (search?.get('uid') || '').trim();

  // Estados por seção
  const [filesIdentidade, setFilesIdentidade] = useState<File[]>([]);
  const [filesEndereco, setFilesEndereco] = useState<File[]>([]);
  const [filesOutros, setFilesOutros] = useState<File[]>([]);

  const inputIdRef = useRef<HTMLInputElement | null>(null);
  const inputEndRef = useRef<HTMLInputElement | null>(null);
  const inputOutRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyDelete, setBusyDelete] = useState<BusyKey>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clienteNome, setClienteNome] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { setToken(getToken()); }, []);

  function pickStr(...vals: any[]): string {
    for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
    return '';
  }

  async function fetchStatus() {
    if (!extratoId) return;
    try {
      const headers: Record<string,string> = { 'X-Usuario-Id': (uidQS || '0') };
      if (token) {
        headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }
      
      const res = await axios.get<StatusResp>(`${API_BASE}/uploads/status`, {
        params: { extrato_id: extratoId },
        headers,
        withCredentials: true
      });
      setStatus(res.data);
    } catch (e: any) { 
      console.error('Erro ao buscar status:', e);
      // Se der erro, tenta endpoint de fallback
      try {
        const res = await axios.get<StatusResp>(`${API}/uploads/status`, {
          params: { extrato_id: extratoId },
          headers: { 'X-Usuario-Id': (uidQS || '0') },
        });
        setStatus(res.data);
      } catch (e2: any) {
        console.error('Erro no fallback:', e2);
      }
    }
  }

  async function resolveNomes() {
    if (!extratoId) return;
    const headersAuth: Record<string,string> = {};
    if (token) headersAuth.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    let d: any = await fetchJSON(`${API_BASE}/extratos/${extratoId}`, headersAuth);
    if (!d) d = await fetchJSON(`${API}/extratos/${extratoId}`, { 'X-Usuario-Id': (uidQS || '0') }) || {};

    const clienteObj = d?.cliente || d?.extrato?.cliente;
    setClienteNome(pickStr(clienteObj?.nome, clienteObj?.nome_cliente, d?.cliente_nome, d?.nome_cliente, d?.extrato?.nome_cliente, d?.nome));
  }

  /* ---- Notificar Advogado ---- */
  async function notifyAdvogado() {
    if (!extratoId) return;
    setBusy(true);
    setError(null);
    
    try {
      const headers: Record<string,string> = { 
        'X-Usuario-Id': (uidQS || '0'),
        'Content-Type': 'application/json'
      };
      if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const url = `${API_BASE}/uploads/notify?extrato_id=${extratoId}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(errorData.detail || 'Erro ao notificar advogado');
      }

      const data = await res.json();
      
      if (data.sent) {
        alert(`E-mail enviado com sucesso para ${data.advogado_email}!`);
        await fetchStatus(); // Atualiza status
      } else {
        alert(`Não foi possível enviar: ${data.reason}`);
      }
    } catch (err: any) {
      console.error('Erro ao notificar advogado:', err);
      setError(err.message || 'Erro ao notificar advogado');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    resolveNomes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extratoId, uidQS, token]);

  /* ---- Upload genérico ---- */
  async function uploadFiles(tipo: 'documento_identidade' | 'comprovante_endereco' | 'outros', files: File[]) {
    if (!files.length) return;
    if (!extratoId) { setError('extratoId não identificado na URL.'); return; }

    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const form = new FormData();
        form.append('file', f);

        const url = new URL(`${API_BASE}/uploads/${tipo}`);
        url.searchParams.set('extrato_id', extratoId);

        const headers: Record<string,string> = { 'X-Usuario-Id': (uidQS || '0') };
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

        await axios.post(url.toString(), form, { headers, withCredentials: true, timeout: 60000 });
      }
      await fetchStatus();
      // ✅ CORREÇÃO: Limpar tanto o input quanto o estado dos arquivos após upload bem-sucedido
      if (tipo === 'documento_identidade') {
        if (inputIdRef.current) inputIdRef.current.value='';
        setFilesIdentidade([]);
      } else if (tipo === 'comprovante_endereco') {
        if (inputEndRef.current) inputEndRef.current.value='';
        setFilesEndereco([]);
      } else {
        if (inputOutRef.current) inputOutRef.current.value='';
        setFilesOutros([]);
      }
    } catch (e: any) {
      const data = e?.response?.data;
      const detail = data?.detail;
      const msg = Array.isArray(detail) ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join('; ')
                : (typeof detail === 'object' ? (detail?.msg || JSON.stringify(detail)) : (detail || e?.message || 'Erro desconhecido'));
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  /* ---- Remover existente ---- */
  async function removeExisting(
    tipo: 'comprovante_endereco' | 'documento_identidade' | 'extrato_original' | 'comprovante_renda' | 'outros',
    url: string,
    subtipo?: 'frente'|'verso'|'completo'
  ) {
    if (!extratoId || !url) return;
    const key = tipo;
    if (!confirm('Remover este arquivo?')) return;
    setBusyDelete(`${tipo}:${subtipo || 'x'}:${url}`);

    try {
      // Use GET with query params to match backend implementation and avoid CORS preflight
      const headers: Record<string,string> = {
        'X-Usuario-Id': uidQS || '0'
      };
      const token = (typeof window !== 'undefined') ? (localStorage.getItem("token") || sessionStorage.getItem("token")) : null;
      if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

      const removeUrl = `${API_BASE}/uploads/remove_file/${extratoId}?key=${encodeURIComponent(tipo)}&url=${encodeURIComponent(url)}`;
      const res = await fetch(removeUrl, { method: 'GET', headers, credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Erro ao remover arquivo');
      }

      await fetchStatus();
    } catch (err: any) {
      console.error('Erro ao remover arquivo:', err);
      alert(err?.message || 'Erro ao remover arquivo');
    } finally {
      setBusyDelete(null);
    }
  }

  /* ===== Card de upload ===== */
  function SectionCard({
    title, ok, optional = false, inputRef, accept = "image/*,application/pdf",
    files, onPick, onClearAll, onUpload, existing, tipo, withSubtypes = false,
  }: {
    title: string; ok: boolean; optional?: boolean; inputRef: React.RefObject<HTMLInputElement>;
    accept?: string; files: File[]; onPick: (files: File[]) => void; onClearAll: () => void;
    onUpload: () => void; existing: { url: string; subtipo?: 'frente'|'verso'|'completo'; key: string }[];
    tipo: 'documento_identidade' | 'comprovante_endereco' | 'outros'; withSubtypes?: boolean;
  }) {
    function StatusPill({ok, children}:{ok:boolean; children:any}) {
      return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {children}
        </span>
      );
    }
    function NeutralPill({children}:{children:any}) {
      return (
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-slate-200 text-slate-700">
          {children}
        </span>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {optional ? <NeutralPill>Opcional</NeutralPill> : <StatusPill ok={ok}>{ok ? 'OK' : 'Pendente'}</StatusPill>}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => {
              const selectedFiles = Array.from(e.target.files || []);
              const MAX_SIZE = 10 * 1024 * 1024; // 10MB
              const validFiles = selectedFiles.filter(file => {
                if (file.size > MAX_SIZE) {
                  alert(`O arquivo "${file.name}" é muito grande. O tamanho máximo é de 10MB.`);
                  return false;
                }
                return true;
              });
              // ✅ SOLUÇÃO SIMPLES: Concatenar arquivos diretamente
              const currentFiles = files || [];
              const allFiles = [...currentFiles, ...validFiles];
              onPick(allFiles);
              // Limpar o input
              if (e.target) e.target.value = '';
            }}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 active:scale-[0.99]"
            >
              📎 Selecionar arquivo(s)
            </button>
            <button
              type="button"
              onClick={onUpload}
              disabled={busy || files.length === 0}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {busy ? 'Enviando...' : 'Enviar'}
            </button>
          </div>

        {files.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">
                {files.length} arquivo(s) selecionado(s)
              </div>
              <button
                type="button"
                onClick={onClearAll}
                className="ml-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                title="Remover todos"
              >
                Remover todos
              </button>
            </div>
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${title}-${f.name}-${i}`} className="flex items-center justify-between text-xs text-slate-700 bg-white rounded-lg px-2 py-1">
                  <span className="truncate mr-2">{f.name} ({Math.round(f.size/1024)} KB)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newFiles = files.filter((_, index) => index !== i);
                      onPick(newFiles);
                    }}
                    className="ml-2 text-rose-600 hover:text-rose-800 font-semibold"
                    title="Remover este arquivo"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold text-slate-600 mb-1">Arquivos enviados</div>
          {existing.length ? (
            <ul className="space-y-2">
              {existing.map(({ url, subtipo, key }) => (
                <li key={key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <div className="truncate mr-3">
                    {withSubtypes && subtipo ? <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">{subtipo}</span> : null}
                    <a href={url} target="_blank" rel="noreferrer" className="underline">{url}</a>
                  </div>
                  <button
                    onClick={() => removeExisting(tipo, url, subtipo)}
                    disabled={busyDelete === `${tipo}:${subtipo || 'x'}:${url}`}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    {busyDelete === `${tipo}:${subtipo || 'x'}:${url}` ? 'Removendo...' : 'Remover'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-500">Nenhum arquivo.</div>
          )}
        </div>
      </div>
    );
  }

  // Mapeia resposta nova para formato antigo
  const mapStatusToOldFormat = (status: StatusResp | null) => {
    if (!status) return { endereco_ok: false, identidade_ok: false, minimos_ok: false };
    
    // Se tem o formato antigo, usa ele
    if (status.minimos) {
      return {
        endereco_ok: status.minimos.endereco_ok,
        identidade_ok: status.minimos.identidade_ok,
        minimos_ok: status.minimos.ok
      };
    }
    
    // Se tem o formato novo, mapeia dos itens
    const itens = status.itens || [];
    const endereco_ok = itens.some(item => item.tipo === 'comprovante_endereco');
    const identidade_ok = itens.some(item => item.tipo === 'documento_identidade');
    const minimos_ok = endereco_ok && identidade_ok;
    
    return { endereco_ok, identidade_ok, minimos_ok };
  };

  const { endereco_ok: enderecoOk, identidade_ok: identidadeOk, minimos_ok: minimosOk } = mapStatusToOldFormat(status);

  // ======= Deriva 'último envio' de forma robusta (BD) =======
  const extras = status?.from_db?.extras || {};
  const rawHist = Array.isArray(extras?.adv_email_history) ? extras.adv_email_history : [];
  const orderedHist = [...rawHist].sort((a,b)=>Date.parse(b?.at||'0')-Date.parse(a?.at||'0'));
  const top5 = orderedHist.slice(0,5);

  const lastToRaw   = extras?.adv_email_last_sent_to || top5[0]?.to || '';
  const lastNameRaw = extras?.adv_email_last_sent_name || top5[0]?.name || '';
  const lastAtRaw   = extras?.adv_email_last_sent_at  || top5[0]?.at || '';

  const alreadySent = !!(lastAtRaw || lastToRaw || lastNameRaw || top5.length > 0);

  // Mapeia arquivos dos itens para o formato antigo
  const getFilesFromStatus = (tipo: string) => {
    const itens = status?.itens || [];
    return itens.filter(item => item.tipo === tipo).map(item => item.url);
  };

  const fs = status?.from_filesystem;
  const identidadeFsRaw: string[] = (() => {
    // ✅ SOLUÇÃO SIMPLES: usar from_filesystem diretamente
    const raw = fs?.documento_identidade;
    if (Array.isArray(raw)) {
      return raw.filter((x) => typeof x === "string" && x.trim());
    }
    return [];
  })();
  const identidadeList: string[] = [];
  const identidadeSeen = new Set<string>();
  const identidadeDbRaw = (() => {
    const raw = extras?.documento_identidade;
    if (Array.isArray(raw)) return raw.filter((x: any) => typeof x === "string" && x.trim());
    if (raw && typeof raw === "object") {
      const bag: string[] = [];
      const candLista = Array.isArray((raw as any).lista) ? (raw as any).lista : [];
      const candCompleto = Array.isArray((raw as any).completo) ? (raw as any).completo : [];
      const candFrente = Array.isArray((raw as any).frente) ? (raw as any).frente : [];
      const candVerso = Array.isArray((raw as any).verso) ? (raw as any).verso : [];
      bag.push(
        ...candLista,
        ...candCompleto,
        ...candFrente,
        ...candVerso,
      );
      return bag.filter((x) => typeof x === "string" && x.trim());
    }
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
  })();
  for (const url of [...identidadeFsRaw, ...identidadeDbRaw]) {
    if (!url) continue;
    const trimmed = url.trim();
    if (trimmed && !identidadeSeen.has(trimmed)) {
      identidadeSeen.add(trimmed);
      identidadeList.push(trimmed);
    }
  }
  const existentesIdentidade = identidadeList.map((url, i) => ({ url, key: `id-${i}` }));
  console.log('📋 existentesIdentidade calculado:', existentesIdentidade);

  const enderecoDbList = collectStrings(
    extras?.comprovante_endereco_url,
    extras?.comprovante_endereco,
    extras?.endereco?.comprovante,
  );
  
  // Prioriza arquivos do formato novo (itens)
  const enderecoFromItens = getFilesFromStatus('comprovante_endereco');
  const enderecoAll = Array.from(new Set([
    ...enderecoFromItens,
    ...(fs?.comprovante_endereco || []),
    ...enderecoDbList,
    typeof status?.from_db?.comprovante_endereco_url === "string" ? status.from_db.comprovante_endereco_url : null,
    typeof status?.from_db?.extrato?.comprovante_endereco_url === "string" ? status.from_db.extrato.comprovante_endereco_url : null,
  ].filter((x): x is string => typeof x === "string" && x.trim())));
  const existentesEndereco   = enderecoAll.map((url, i) => ({ url, key: `ce-${i}` }));

  const outrosFromItens = getFilesFromStatus('outros');
  const outrosAll = collectStrings(extras?.outros, fs?.outros, extras?.anexos?.outros, ...outrosFromItens);
  const existentesOutros     = Array.from(new Set(outrosAll)).map((url, i) => ({ url, key: `ot-${i}` }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-32">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <TarjaInline />

        {/* Ações principais */}
        <div className="mt-2 mb-4 flex items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={notifyAdvogado}
            disabled={!minimosOk || busy || alreadySent}
            className={`min-w-[180px] sm:min-w-[220px] h-11 sm:h-12 inline-flex items-center justify-center rounded-xl text-sm sm:text-base font-semibold shadow-sm ${(!minimosOk || alreadySent) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
            title={alreadySent ? 'Já enviado; use Reenviar' : 'Enviar ao Advogado'}
          >
            Enviar ao Advogado
          </button>
          <button
            onClick={notifyAdvogado}
            disabled={!minimosOk || busy || !alreadySent}
            className={`min-w-[150px] sm:min-w-[180px] h-11 sm:h-12 inline-flex items-center justify-center rounded-xl text-sm sm:text-base font-semibold shadow-sm ${(!minimosOk || !alreadySent) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
            title="Reenviar e-mail"
          >
            Reenviar e-mail
          </button>
        </div>

        {/* Card principal */}
        <div className="rounded-2xl border border-slate-300 bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.15)] overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/60 p-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
              Anexos — {clienteNome ? clienteNome : '—'}
            </h1>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white ${minimosOk ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                Pronto para Enviar: {minimosOk ? 'Sim' : 'Não'}
              </span>
            </div>
          </div>

          {/* === GRID 1: uploads (2 colunas em md+) === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6">
            <SectionCard
              title="Documento de Identidade"
              ok={!!identidadeOk}
              inputRef={inputIdRef}
              files={filesIdentidade}
              onPick={setFilesIdentidade}
              onClearAll={() => { setFilesIdentidade([]); if (inputIdRef.current) inputIdRef.current.value=''; }}
              onUpload={() => uploadFiles('documento_identidade', filesIdentidade)}
              existing={existentesIdentidade}
              tipo="documento_identidade"
            />

            <SectionCard
              title="Comprovante de Endereço"
              ok={!!enderecoOk}
              inputRef={inputEndRef}
              files={filesEndereco}
              onPick={setFilesEndereco}
              onClearAll={() => { setFilesEndereco([]); if (inputEndRef.current) inputEndRef.current.value=''; }}
              onUpload={() => uploadFiles('comprovante_endereco', filesEndereco)}
              existing={existentesEndereco}
              tipo="comprovante_endereco"
            />

            <div className="md:col-span-2">
              <SectionCard
                title="Outros Anexos"
                ok={existentesOutros.length > 0}
                optional
                inputRef={inputOutRef}
                files={filesOutros}
                onPick={setFilesOutros}
                onClearAll={() => { setFilesOutros([]); if (inputOutRef.current) inputOutRef.current.value=''; }}
                onUpload={() => uploadFiles('outros', filesOutros)}
                existing={existentesOutros}
                tipo="outros"
              />
            </div>
          </div>

          {/* === GRID 2: linha final 60/40 (md:grid-cols-5) === */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 p-6 pt-0">
            {/* 40% */}
            <div className="md:col-span-2">
              <div className={`rounded-xl border p-4 text-sm ${minimosOk ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900'}`}>
                <div className="font-semibold mb-1">Mínimos</div>
                <div>Endereço: {enderecoOk ? 'OK' : 'Pendente'} · Identidade: {identidadeOk ? 'OK' : 'Pendente'}</div>
                <div>Pronto para “Salvar/Enviar”: <b>{minimosOk ? 'Sim' : 'Não'}</b></div>
              </div>
            </div>

            {/* 60% */}
            <div className="md:col-span-3">
              <AdvogadoStatusCard
                lastTo={lastToRaw}
                lastName={lastNameRaw}
                lastAt={lastAtRaw}
                history={top5}
              />
            </div>

            {error && (
              <div className="md:col-span-5 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                ⚠ {error}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé fixo */}
        <div className="fixed left-0 right-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={() => router.push('/gerencial/processos')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 active:scale-[0.99]"
              title="Voltar para Processos"
            >
              <span>←</span> Voltar para Processos
            </button>
            <div className="text-xs text-slate-500">Extrato #{extratoId || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
