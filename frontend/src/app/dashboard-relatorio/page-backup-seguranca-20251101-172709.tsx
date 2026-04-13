"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Target, Award, BarChart3, Calendar, Trophy, Medal, Star } from "lucide-react";
import { getLoggedUser, getToken, filterByScope, canSeeAll } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

// Função para formatar valor em BRL
function fmtBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

// Função para formatar percentual
function fmtPercent(valor: number): string {
  return `${valor.toFixed(1)}%`;
}

// Funções de status copiadas da página gerencial (fonte da verdade)
function normalizeDocStatus(raw?: string): string {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  if (["enviado","enviada","enviados","sent","enviado_para_assinatura"].includes(s)) return "Enviado";
  if (["assinado","assinada","signed","finalizado","concluido","concluído"].includes(s)) return "Assinado";
  if (["assinado_externo","assinado_fora","assinatura_externa"].includes(s)) return "Assinado (fora)";
  if (["cancelado","rejeitado","recusado"].includes(s)) return "Cancelado";
  if (["salvo","salva","saved","criado","criada"].includes(s)) return "Salvo";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getDisplayStatus(row: any): string {
  // 🎯 PRIORIDADE 1: Se tem número de processo → CONCLUÍDO
  const numeroProc = (row?.numero_processo ?? row?.numeroProcesso ?? row?.processo_numero ?? "").toString().trim();
  if (numeroProc && numeroProc !== "None" && numeroProc !== "") {
    return "Concluído";
  }

  // Verifica se foi marcado como assinado externamente
  const extras = row?.extras || {};
  if (extras.signed_external === true) {
    return "Assinado (fora)";
  }

  // O banco é a fonte da verdade - usa status_documento primeiro
  const status_doc = row?.status_documento;
  if (status_doc) {
    const normalized = normalizeDocStatus(status_doc);
    if (normalized) return normalized;
  }

  // Fallback para outros campos se status_documento estiver vazio
  const cand = [
    row?.status_doc,
    row?.zapsign_status,
    row?.status_nome_documento,
    row?.status,
  ];
  for (const c of cand) {
    const v = normalizeDocStatus(c as any);
    if (v) return v;
  }
  
  // Se não tem status definido mas tem criado_em, significa que foi salvo
  if (row?.criado_em) {
    return "Salvo";
  }

  return "Indefinido";
}

// Função para verificar se processo foi enviado
function isEnviado(processo: any): boolean {
  const status = getDisplayStatus(processo);
  return status === "Enviado" || 
         status === "Assinado" || 
         status === "Assinado (fora)" || 
         status === "Concluído";
}

// Função para verificar se processo foi assinado (apenas assinados, não concluídos)
function isAssinado(processo: any): boolean {
  const status = getDisplayStatus(processo);
  return status === "Assinado" || status === "Assinado (fora)";
}

// Função para verificar se processo foi concluído
function isConcluido(processo: any): boolean {
  const status = getDisplayStatus(processo);
  return status === "Concluído";
}

// Função para filtrar processos por período de datas
function filtrarPorPeriodo(processos: any[], dataInicial: string | null, dataFinal: string | null): any[] {
  if (!dataInicial && !dataFinal) return processos; // Nenhum filtro = todos os dados
  
  return processos.filter(p => {
    // Usar enviado_em se disponível, senão criado_em
    const dataProcesso = p.enviado_em ? new Date(p.enviado_em) : 
                        p.criado_em ? new Date(p.criado_em) : new Date();
    
    const dataProcessoSemHora = new Date(dataProcesso.getFullYear(), dataProcesso.getMonth(), dataProcesso.getDate());
    
    // Aplicar filtro de data inicial
    if (dataInicial) {
      const inicial = new Date(dataInicial);
      if (dataProcessoSemHora < inicial) return false;
    }
    
    // Aplicar filtro de data final
    if (dataFinal) {
      const final = new Date(dataFinal);
      if (dataProcessoSemHora > final) return false;
    }
    
    return true;
  });
}

export default function DashboardRelatorioPage() {
  const [loading, setLoading] = useState(true);
  const [processos, setProcessos] = useState<any[]>([]);
  const [usuario, setUsuario] = useState<any>(null);
  const [dataInicial, setDataInicial] = useState<string>(''); // Data inicial do filtro
  const [dataFinal, setDataFinal] = useState<string>(''); // Data final do filtro

  // Filtrar processos por período
  const processosFiltrados = useMemo(() => {
    return filtrarPorPeriodo(processos, dataInicial || null, dataFinal || null);
  }, [processos, dataInicial, dataFinal]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Buscar usuário logado
        const userLogado = getLoggedUser();
        setUsuario(userLogado);

        // Buscar processos
        const token = getToken();
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        const response = await fetch(`${API_BASE}/extratos`, {
          headers,
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          // Aplicar filtro de escopo baseado no perfil do usuário
          const processosFiltered = filterByScope(data || [], userLogado.perfil, userLogado);
          setProcessos(processosFiltered);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Cálculo da performance dos gerentes
  const performanceGerentes = useMemo(() => {
    if (!processosFiltrados.length || !usuario) return [];

    const gerentes = new Map();

    processosFiltrados.forEach(processo => {
      const nomeGerente = processo.gerente_nome || 'Não informado';
      const valorCausa = Number(processo.valor_causa) || 0;
      const enviado = isEnviado(processo);
      const assinado = isAssinado(processo);

      if (!gerentes.has(nomeGerente)) {
        gerentes.set(nomeGerente, {
          nome: nomeGerente,
          totalEnviados: 0,
          valorEnviados: 0,
          totalAssinados: 0,
          valorAssinados: 0,
          percentualQuantidade: 0,
          percentualValor: 0
        });
      }

      const gerente = gerentes.get(nomeGerente);

      if (enviado) {
        gerente.totalEnviados++;
        gerente.valorEnviados += valorCausa;
        
        if (assinado) {
          gerente.totalAssinados++;
          gerente.valorAssinados += valorCausa;
        }
      }

      // Calcular percentuais
      gerente.percentualQuantidade = gerente.totalEnviados > 0 
        ? (gerente.totalAssinados / gerente.totalEnviados) * 100 
        : 0;
      
      gerente.percentualValor = gerente.valorEnviados > 0 
        ? (gerente.valorAssinados / gerente.valorEnviados) * 100 
        : 0;
    });

    return Array.from(gerentes.values())
      .filter(g => g.totalEnviados > 0) // Só mostrar gerentes que enviaram processos
      .sort((a, b) => b.totalEnviados - a.totalEnviados); // Ordenar por total enviados
  }, [processosFiltrados, usuario]);

  // Identificar os melhores performers
  const melhoresPerformers = useMemo(() => {
    if (!performanceGerentes.length) return {};
    
    const maiorProducao = performanceGerentes.reduce((max, g) => 
      g.totalEnviados > max.totalEnviados ? g : max, performanceGerentes[0]);
    
    const melhorPercentualQuantidade = performanceGerentes.reduce((max, g) => 
      g.percentualQuantidade > max.percentualQuantidade ? g : max, performanceGerentes[0]);
    
    const melhorPercentualValor = performanceGerentes.reduce((max, g) => 
      g.percentualValor > max.percentualValor ? g : max, performanceGerentes[0]);

    return {
      maiorProducao,
      melhorPercentualQuantidade,
      melhorPercentualValor
    };
  }, [performanceGerentes]);  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando performance...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3 sm:h-16 gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/gerencial/processos"
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm sm:text-base"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>Voltar</span>
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900">
                Performance dos Gerentes
              </h1>
              {usuario && (
                <div className="text-xs sm:text-sm text-slate-600">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    canSeeAll(usuario.perfil) 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {canSeeAll(usuario.perfil) ? 'Visão Completa' : 'Minha Performance'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Introdução */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
            📊 Performance dos Gerentes
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Acompanhe a produtividade com base em <strong>processos enviados</strong> e <strong>taxa de conversão em assinaturas</strong>.
          </p>
        </div>

        {/* Filtros de Período */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-700">Filtro por Período</h3>
          </div>
          
          <div className="space-y-4">
            {/* Campos de Data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Data Inicial */}
              <div>
                <label htmlFor="dataInicial" className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">
                  Data Inicial
                </label>
                <input
                  type="date"
                  id="dataInicial"
                  value={dataInicial}
                  onChange={(e) => setDataInicial(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              {/* Data Final */}
              <div>
                <label htmlFor="dataFinal" className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">
                  Data Final
                </label>
                <input
                  type="date"
                  id="dataFinal"
                  value={dataFinal}
                  onChange={(e) => setDataFinal(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            {/* Botões de Ação Principais */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setDataInicial('');
                  setDataFinal('');
                }}
                className="w-full sm:w-auto px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                Limpar Filtros
              </button>
              <button
                onClick={() => {
                  const hoje = new Date();
                  const trintaDiasAtras = new Date();
                  trintaDiasAtras.setDate(hoje.getDate() - 30);
                  setDataInicial(trintaDiasAtras.toISOString().split('T')[0]);
                  setDataFinal(hoje.toISOString().split('T')[0]);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
              >
                Últimos 30 dias
              </button>
            </div>
          </div>
          
          {/* Filtros Rápidos */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => {
                  const hoje = new Date();
                  const seteDiasAtras = new Date();
                  seteDiasAtras.setDate(hoje.getDate() - 7);
                  setDataInicial(seteDiasAtras.toISOString().split('T')[0]);
                  setDataFinal(hoje.toISOString().split('T')[0]);
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-1 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 transition-colors text-xs sm:text-sm text-center"
              >
                7 dias
              </button>
              <button
                onClick={() => {
                  const hoje = new Date();
                  const tresMesesAtras = new Date();
                  tresMesesAtras.setMonth(hoje.getMonth() - 3);
                  setDataInicial(tresMesesAtras.toISOString().split('T')[0]);
                  setDataFinal(hoje.toISOString().split('T')[0]);
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-1 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors text-xs sm:text-sm text-center"
              >
                3 meses
              </button>
              <button
                onClick={() => {
                  const hoje = new Date();
                  const seisMesesAtras = new Date();
                  seisMesesAtras.setMonth(hoje.getMonth() - 6);
                  setDataInicial(seisMesesAtras.toISOString().split('T')[0]);
                  setDataFinal(hoje.toISOString().split('T')[0]);
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-1 bg-amber-100 text-amber-700 rounded-md hover:bg-amber-200 transition-colors text-xs sm:text-sm text-center"
              >
                6 meses
              </button>
              <button
                onClick={() => {
                  const hoje = new Date();
                  const umAnoAtras = new Date();
                  umAnoAtras.setFullYear(hoje.getFullYear() - 1);
                  setDataInicial(umAnoAtras.toISOString().split('T')[0]);
                  setDataFinal(hoje.toISOString().split('T')[0]);
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs sm:text-sm text-center"
              >
                1 ano
              </button>
            </div>
          </div>
          
          <div className="mt-4 text-xs sm:text-sm text-slate-500">
            {!dataInicial && !dataFinal 
              ? 'Mostrando todos os dados disponíveis' 
              : `Filtro aplicado: ${dataInicial ? `desde ${new Date(dataInicial).toLocaleDateString('pt-BR')}` : 'início'} ${dataFinal ? `até ${new Date(dataFinal).toLocaleDateString('pt-BR')}` : 'hoje'}`
            }
          </div>
        </div>

        {/* Destaques de Performance */}
        {Object.keys(melhoresPerformers).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-700">🏆 Destaques do Período</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Maior Produção */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 sm:p-6 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Star className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  <span className="text-xs sm:text-sm font-medium text-blue-600">MAIOR PRODUÇÃO</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-blue-900 mb-1">{melhoresPerformers.maiorProducao.nome}</div>
                <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">{melhoresPerformers.maiorProducao.totalEnviados}</div>
                <div className="text-xs sm:text-sm text-blue-700">processos enviados</div>
              </div>

              {/* Melhor Taxa por Quantidade */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 sm:p-6 rounded-xl border border-green-200">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Medal className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  <span className="text-xs sm:text-sm font-medium text-green-600">MELHOR TAXA (PROCESSOS)</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-green-900 mb-1">{melhoresPerformers.melhorPercentualQuantidade.nome}</div>
                <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">{melhoresPerformers.melhorPercentualQuantidade.percentualQuantidade.toFixed(1)}%</div>
                <div className="text-xs sm:text-sm text-green-700">de conclusão</div>
              </div>

              {/* Melhor Taxa por Valor */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 sm:p-6 rounded-xl border border-purple-200 sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                  <span className="text-xs sm:text-sm font-medium text-purple-600">MELHOR TAXA (VALOR)</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-purple-900 mb-1">{melhoresPerformers.melhorPercentualValor.nome}</div>
                <div className="text-2xl sm:text-3xl font-bold text-purple-600 mb-1">{melhoresPerformers.melhorPercentualValor.percentualValor.toFixed(1)}%</div>
                <div className="text-xs sm:text-sm text-purple-700">do valor concluído</div>
              </div>
            </div>
          </div>
        )}

        {/* Cards de Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {performanceGerentes.map((gerente, index) => (
            <div key={gerente.nome} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Header do Gerente */}
              <div className={`p-3 sm:p-4 lg:p-6 ${index === 0 ? 'bg-gradient-to-r from-emerald-50 to-blue-50' : 'bg-slate-50'}`}>
                <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-0">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {index === 0 && <Award className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-emerald-600" />}
                    <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-slate-900">
                      {gerente.nome}
                    </h3>
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">
                      🏆 Top
                    </span>
                  )}
                </div>
              </div>

              {/* Métricas */}
              <div className="p-3 sm:p-4 lg:p-6">
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                  {/* Processos Enviados */}
                  <div className="bg-blue-50 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-blue-200">
                    <div className="flex items-center justify-center mb-1 sm:mb-2">
                      <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-blue-600" />
                    </div>
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mb-1">
                      {gerente.totalEnviados}
                    </div>
                    <div className="text-xs text-blue-700 font-semibold mb-1">
                      Enviados
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-blue-800 bg-blue-100 rounded-md sm:rounded-lg py-1 px-1 sm:px-2">
                      {fmtBRL(gerente.valorEnviados)}
                    </div>
                  </div>

                  {/* Processos Assinados */}
                  <div className="bg-emerald-50 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-emerald-200">
                    <div className="flex items-center justify-center mb-1 sm:mb-2">
                      <Target className="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-emerald-600" />
                    </div>
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-600 mb-1">
                      {gerente.totalAssinados}
                    </div>
                    <div className="text-xs text-emerald-700 font-semibold mb-1">
                      Assinados
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-100 rounded-md sm:rounded-lg py-1 px-1 sm:px-2">
                      {fmtBRL(gerente.valorAssinados)}
                    </div>
                  </div>

                  {/* Taxa por Quantidade */}
                  <div className="bg-purple-50 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-purple-200">
                    <div className="flex items-center justify-center mb-1 sm:mb-2">
                      <BarChart3 className="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-purple-600" />
                    </div>
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-600 mb-1">
                      {fmtPercent(gerente.percentualQuantidade)}
                    </div>
                    <div className="text-xs text-purple-700 font-semibold mb-1">
                      Taxa Qtd
                    </div>
                    <div className="text-xs text-purple-600 bg-purple-100 rounded-md sm:rounded-lg py-1 px-1 sm:px-2">
                      {gerente.totalAssinados}/{gerente.totalEnviados}
                    </div>
                  </div>

                  {/* Taxa por Valor */}
                  <div className="bg-amber-50 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-amber-200">
                    <div className="flex items-center justify-center mb-1 sm:mb-2">
                      <BarChart3 className="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-amber-600" />
                    </div>
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-600 mb-1">
                      {fmtPercent(gerente.percentualValor)}
                    </div>
                    <div className="text-xs text-amber-700 font-semibold mb-1">
                      Taxa Valor
                    </div>
                    <div className="text-xs text-amber-700 bg-amber-100 rounded-md sm:rounded-lg py-1 px-1 sm:px-2">
                      Performance
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Estado vazio */}
        {performanceGerentes.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Nenhum dado encontrado
            </h3>
            <p className="text-slate-600">
              Não há processos enviados para exibir a performance dos gerentes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}