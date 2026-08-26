'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterByScope, getLoggedUser } from "@/app/lib/auth";
import MLStatus from "@/components/ml/MLStatus";

/** ===== Gate sem mudar a ordem dos hooks da página ===== */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    try {
      const u = getLoggedUser();
      const perfil = (u?.perfil || "").toLowerCase();
      if (perfil === "admin") setOk(true);
      else router.replace("/gerencial/processos");
    } catch {
      router.replace("/gerencial/processos");
    }
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}

type Extrato = {
  id: number | string;
  nome_cliente?: string;
  cpf_cnpj?: string;
  grupo?: string | number;
  cota?: string | number;
  status_documento?: string;
  created_at?: string;
  updated_at?: string;
  // campos potenciais de autoria/gerência usados no filtro em memória:
  gerente_id?: any;
  gerente_nome?: string;
  criado_por_id?: any;
  criado_por_nome?: string;
  usuario_criador_nome?: string;
  responsavel_nome?: string;
  [k: string]: any;
};

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

// ── Página ──────────────────────────────────────────────────────────────────
export default function ExtratosListPage() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<string>('6'); // mantém para header/back-compat
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [extratos, setExtratos] = useState<Extrato[]>([]);

  const [busca, setBusca] = useState<string>('');
  const [statusFiltro, setStatusFiltro] = useState<string>('');

  async function fetchExtratos() {
    setLoading(true);
    setErro(null);
    try {
      const url = `${API}/extratos`;
      const res = await fetch(url, { headers: { 'X-Usuario-Id': usuarioId || '0' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.items ?? []);
      setExtratos(arr);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar extratos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchExtratos(); /* eslint-disable-next-line */ }, [usuarioId]);

  const usuarioAtual = useMemo(() => getLoggedUser(), []);
  const perfil = String(usuarioAtual?.perfil || "").toLowerCase() === "admin" ? "admin" : "gerente";

  const itens = useMemo(() => {
    // 1) escopo por perfil
    let base = [...extratos];
    if (perfil !== "admin") base = filterByScope(base, perfil, usuarioAtual);

    // 2) filtro de busca/status
    const q = busca.trim().toLowerCase();
    const arr = base.filter((e) => {
      if (statusFiltro && String(e.status_documento || '') !== statusFiltro) return false;
      if (!q) return true;
      const bag = [
        e.id,
        e.nome_cliente,
        e.cpf_cnpj,
        e.grupo,
        e.cota,
        e.status_documento,
        e.gerente_nome,
        e.criado_por_nome,
        e.usuario_criador_nome,
      ].map((x) => (x == null ? '' : String(x).toLowerCase()));
      return bag.some((s) => s.includes(q));
    });

    // 3) ordena (mais recentes)
    return arr.sort((a, b) => {
      const aa = new Date(b.updated_at || b.created_at || 0).getTime();
      const bb = new Date(a.updated_at || a.created_at || 0).getTime();
      return aa - bb;
    });
  }, [extratos, busca, statusFiltro, perfil, usuarioAtual]);

  return (
    <AdminOnly>
      <div className="max-w-6xl mx-auto p-4 md:p-6 font-[Inter,system-ui,Arial]">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-2xl font-semibold">
            Extratos
            <span className="ml-2 align-middle rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300">
              Escopo: {perfil === "admin" ? "Administrador (todos)" : "Gerente (somente os seus)"}
            </span>
          </h1>
        </div>

        {/* Sistema ML Status */}
        <div className="mb-6">
          <MLStatus />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="ml-auto text-sm text-gray-600 flex items-center gap-2">
            Usuário (header):
            <input
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              className="border rounded px-2 py-1 w-24"
              title="X-Usuario-Id"
            />
            <button
              onClick={fetchExtratos}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
              title="Atualizar lista"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, CPF/CNPJ, grupo, cota, status, gerente…"
              className="flex-1 border rounded px-3 py-2"
            />
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="border rounded px-3 py-2 w-full sm:w-56"
            >
              <option value="">Todos os status</option>
              <option value="enviado">enviado</option>
              <option value="assinado">assinado</option>
              <option value="rascunho">rascunho</option>
            </select>
          </div>
        </div>

        {loading && <div>Carregando…</div>}
        {erro && !loading && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {erro}
          </div>
        )}

        {!loading && !erro && (
          <div className="overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-2 w-20">ID</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">CPF/CNPJ</th>
                  <th className="text-left p-2">Grupo</th>
                  <th className="text-left p-2">Cota</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2 w-[280px]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((e) => (
                  <tr key={String(e.id)} className="border-t">
                    <td className="p-2">{e.id}</td>
                    <td className="p-2">{e.nome_cliente ?? '-'}</td>
                    <td className="p-2">{e.cpf_cnpj ?? '-'}</td>
                    <td className="p-2">{e.grupo ?? '-'}</td>
                    <td className="p-2">{e.cota ?? '-'}</td>
                    <td className="p-2">{e.status_documento ?? '-'}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push(`/?extratoId=${encodeURIComponent(String(e.id))}&mode=adv&reload=${Date.now()}`)}
                          className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                          title="Abrir na tela principal"
                        >
                          Abrir
                        </button>
                        <button
                          onClick={() => router.push(`/extratos/${encodeURIComponent(String(e.id))}/processo`)}
                          className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                          title="Abrir página do processo"
                        >
                          Processo
                        </button>
                        <button
                          onClick={() => router.push(`/anexos/${encodeURIComponent(String(e.id))}`)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                          title="Gerenciar anexos"
                        >
                          Anexos
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!itens.length && (
                  <tr>
                    <td className="p-4 text-gray-500" colSpan={7}>
                      Nenhum extrato encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminOnly>
  );
}
