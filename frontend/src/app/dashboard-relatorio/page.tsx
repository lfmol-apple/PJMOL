"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Target, Award, BarChart3, Calendar, Trophy } from "lucide-react";
import { getLoggedUser, getToken, filterByScope, canSeeAll, normalizeRole } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";
const ACCESS_DENIED_MESSAGE = "Este acesso não diz respeito ao seu desempenho. É de uso exclusivo dos administradores do negócio.";

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

// Função para verificar se processo tem número de processo (fluxo concluído)
function hasNumeroProcesso(processo: any): boolean {
  const numeroProc = (processo?.numero_processo ?? processo?.numeroProcesso ?? processo?.processo_numero ?? "").toString().trim();
  return numeroProc && numeroProc !== "None" && numeroProc !== "";
}

// Função para verificar se processo foi enviado
function isEnviado(processo: any): boolean {
  const status = getDisplayStatus(processo);
  return status === "Enviado" || 
         status === "Assinado" || 
         status === "Assinado (fora)";
}

// Função para verificar se processo foi assinado (apenas assinados, não concluídos)
function isAssinado(processo: any): boolean {
  const status = getDisplayStatus(processo);
  return status === "Assinado" || status === "Assinado (fora)";
}

// Função para verificar se processo foi concluído (tem numero de processo)
function isConcluido(processo: any): boolean {
  return hasNumeroProcesso(processo);
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
  const [accessDenied, setAccessDenied] = useState(false);
  const [dataInicial, setDataInicial] = useState<string>(''); // Data inicial do filtro
  const [dataFinal, setDataFinal] = useState<string>(''); // Data final do filtro

  // Filtrar processos por período
  const processosFiltrados = useMemo(() => {
    return filtrarPorPeriodo(processos, dataInicial || null, dataFinal || null);
  }, [processos, dataInicial, dataFinal]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar usuário logado
        const userLogado = getLoggedUser();
        
        // Verificar se é admin
        if (normalizeRole(userLogado.perfil) !== "admin") {
          setUsuario(userLogado);
          setAccessDenied(true);
          setProcessos([]);
          setLoading(false);
          return;
        }
        
        setLoading(true);
        setAccessDenied(false);
        setUsuario(userLogado);

        // Buscar processos
        const token = getToken();
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Perfil': String(userLogado?.perfil || ''),
          ...(userLogado?.id != null ? { 'X-Usuario-Id': String(userLogado.id) } : {})
        };

        const response = await fetch(`${API_BASE}/extratos`, {
          headers,
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          // 📊 RELATÓRIO: Admin e Gerentes veem TODOS os dados (não filtrar por escopo)
          const userRole = normalizeRole(userLogado.perfil);
          const processosFiltered = (userRole === "admin" || userRole === "gerente") 
            ? data || [] 
            : filterByScope(data || [], userLogado.perfil, userLogado);
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

  // 🆕 Cálculo de CRIADOS x CONCLUÍDOS por gerente
  // 📌 IMPORTANTE: "Concluído" agora significa que o processo tem número de processo preenchido (fluxo completo)
  //    e não está mais relacionado ao status da documentação
  const performanceCriadosConcluidos = useMemo(() => {
    if (!processosFiltrados.length || !usuario) return [];

    const gerentes = new Map();

    processosFiltrados.forEach(processo => {
      const nomeGerente = processo.gerente_nome || 'Não informado';
      const concluido = isConcluido(processo); // ✅ Verifica se tem numero_processo
      const valorCausa = Number(processo.valor_causa) || 0;

      if (!gerentes.has(nomeGerente)) {
        gerentes.set(nomeGerente, {
          nome: nomeGerente,
          totalCriados: 0,
          totalConcluidos: 0,
          valorTotalCausas: 0,
          percentualConcluidos: 0
        });
      }

      const gerente = gerentes.get(nomeGerente);
      gerente.totalCriados++;
      gerente.valorTotalCausas += valorCausa;
      
      if (concluido) {
        gerente.totalConcluidos++;
      }

      // Calcular percentual de concluídos
      gerente.percentualConcluidos = gerente.totalCriados > 0 
        ? (gerente.totalConcluidos / gerente.totalCriados) * 100 
        : 0;
    });

    return Array.from(gerentes.values())
      .filter(g => g.totalCriados > 0)
      .sort((a, b) => b.totalCriados - a.totalCriados);
  }, [processosFiltrados, usuario]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando performance...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <Link href="/gerencial/processos" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-semibold">
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar</span>
            </Link>
          </div>
        </div>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Acesso restrito</h1>
            <p className="mt-3 text-base font-semibold leading-7 text-slate-700">{ACCESS_DENIED_MESSAGE}</p>
          </div>
        </main>
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

        {/* 🆕 NOVA SEÇÃO: Performance Criados x Concluídos */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-700">📊 Processos Criados x Concluídos por Gerente</h3>
          </div>

          {performanceCriadosConcluidos.map((gerente, index) => (
            <div
              key={gerente.nome}
              className={`rounded-xl sm:rounded-2xl overflow-hidden shadow-sm mb-4 border-2 ${
                index === 0 ? 'border-indigo-300' : 'border-slate-200'
              }`}
            >
              {/* Header */}
              <div className={`p-4 sm:p-6 ${index === 0 ? 'bg-gradient-to-r from-indigo-50 to-purple-50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {index === 0 && <Trophy className="h-5 w-5 text-indigo-600" />}
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                      {gerente.nome}
                    </h3>
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">
                      🏆 Maior Produção
                    </span>
                  )}
                </div>
              </div>

              {/* Métricas */}
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Total Criados */}
                  <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-200">
                    <div className="flex items-center justify-center mb-2">
                      <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">
                      {gerente.totalCriados}
                    </div>
                    <div className="text-xs sm:text-sm text-blue-700 font-semibold mb-2">
                      Criados
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-blue-700 pt-3 border-t-2 border-blue-400 bg-gradient-to-b from-blue-100 to-blue-200 -mx-4 px-4 py-3 rounded-b-xl shadow-inner">
                      {fmtBRL(gerente.valorTotalCausas)}
                    </div>
                  </div>

                  {/* Total Concluídos */}
                  <div className="bg-green-50 rounded-xl p-4 text-center border border-green-200">
                    <div className="flex items-center justify-center mb-2">
                      <Target className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">
                      {gerente.totalConcluidos}
                    </div>
                    <div className="text-xs sm:text-sm text-green-700 font-semibold">
                      Concluídos
                    </div>
                  </div>

                  {/* Percentual */}
                  <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-200">
                    <div className="flex items-center justify-center mb-2">
                      <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-indigo-600 mb-1">
                      {fmtPercent(gerente.percentualConcluidos)}
                    </div>
                    <div className="text-xs sm:text-sm text-indigo-700 font-semibold">
                      Taxa Conclusão
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso */}
                <div className="mt-4">
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-green-500 to-indigo-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${gerente.percentualConcluidos}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-slate-600">
                    <span>{gerente.totalConcluidos} concluídos</span>
                    <span>{gerente.totalCriados - gerente.totalConcluidos} pendentes</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {performanceCriadosConcluidos.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Nenhum processo criado no período selecionado.</p>
            </div>
          )}
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

        {/* 📊 DISTRIBUIÇÃO POR ADVOGADO */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Award className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-slate-700">👨‍⚖️ Distribuição por Advogado</h3>
          </div>
          <div className="space-y-3">
            {(() => {
              const porAdvogado = new Map<string, { count: number; valor: number }>();
              processosFiltrados.forEach(p => {
                const adv = p.advogado_nome || p.advogado_usuario || 'Sem advogado';
                if (!porAdvogado.has(adv)) porAdvogado.set(adv, { count: 0, valor: 0 });
                const data = porAdvogado.get(adv)!;
                data.count++;
                data.valor += Number(p.valor_causa) || 0;
              });
              
              return Array.from(porAdvogado.entries())
                .map(([nome, dados]) => ({
                  nome,
                  count: dados.count,
                  valor: dados.valor,
                  percent: (dados.count / processosFiltrados.length) * 100,
                }))
                .sort((a, b) => b.count - a.count)
                .map((adv, i) => (
                  <div key={i} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900">{adv.nome}</span>
                      <span className="text-sm text-slate-600">
                        {adv.count} processos • {fmtBRL(adv.valor)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-purple-500"
                          style={{ width: `${adv.percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{fmtPercent(adv.percent)}</span>
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>

        {/* 🏢 DISTRIBUIÇÃO POR ADMINISTRADORA */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Award className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-700">🏢 Top 10 Administradoras</h3>
          </div>
          <div className="space-y-3">
            {(() => {
              const porAdm = new Map<string, { count: number; valor: number }>();
              processosFiltrados.forEach(p => {
                const adm = p.administradora || 'Sem administradora';
                if (!porAdm.has(adm)) porAdm.set(adm, { count: 0, valor: 0 });
                const data = porAdm.get(adm)!;
                data.count++;
                data.valor += Number(p.valor_causa) || 0;
              });
              
              return Array.from(porAdm.entries())
                .map(([nome, dados]) => ({
                  nome,
                  count: dados.count,
                  valor: dados.valor,
                  percent: (dados.count / processosFiltrados.length) * 100,
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
                .map((adm, i) => (
                  <div key={i} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900">{adm.nome}</span>
                      <span className="text-sm text-slate-600">{adm.count} processos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${adm.percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{fmtPercent(adm.percent)}</span>
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>

        {/* 🗺️ DISTRIBUIÇÃO POR ESTADO */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Award className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-700">🗺️ Distribuição por Estado</h3>
          </div>
          <div className="space-y-3">
            {(() => {
              // Função auxiliar para extrair UF
              const pickUF = (raw?: string): string => {
                if (!raw) return "";
                const s = String(raw).trim();
                if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
                const slash = s.match(/\/\s*([A-Za-z]{2})$/);
                if (slash) return slash[1].toUpperCase();
                const paren = s.match(/\(\s*([A-Za-z]{2})\s*\)$/);
                if (paren) return paren[1].toUpperCase();
                const uf = s.match(/\b([A-Za-z]{2})\b(?=[^A-Za-z]*$)/);
                return uf ? uf[1].toUpperCase() : "";
              };

              const firstStr = (obj: any, keys: string[]): string => {
                for (const k of keys) {
                  const v = obj?.[k];
                  if (typeof v === "string" && v.trim()) return v.trim();
                }
                return "";
              };

              const getUF = (p: any): string => {
                const ex = (p?.extras && typeof p.extras === "object") 
                  ? p.extras 
                  : (() => { try { return JSON.parse(p?.extras || "{}"); } catch { return {}; } })();

                // Tenta pegar UF diretamente
                const ufRaw = firstStr(p, [
                  "estado_escolhido","uf_escolhida","uf_cliente","estado_cliente","uf_adm","estado_adm","uf","estado"
                ]) || firstStr(ex, [
                  "estado_escolhido","uf_escolhida","uf_cliente","estado_cliente","uf_adm","estado_adm","uf","estado"
                ]);
                let uf = pickUF(ufRaw);

                // Se não achou, tenta extrair da comarca
                if (!uf) {
                  const comarcaCand = firstStr(p, [
                    "comarca_escolhida","comarca_cliente","comarca_adm","comarca_nome","comarca",
                    "cidade_comarca","comarca_cidade","cidade","municipio","municipío","municipio_cliente"
                  ]) || firstStr(ex, [
                    "comarca_escolhida","comarca_cliente","comarca_adm","comarca_nome","comarca",
                    "cidade_comarca","comarca_cidade","cidade","municipio","municipío","municipio_cliente"
                  ]);
                  uf = pickUF(comarcaCand);
                }

                return uf || "Não identificado";
              };

              const porEstado = new Map<string, number>();
              processosFiltrados.forEach(p => {
                const estado = getUF(p);
                porEstado.set(estado, (porEstado.get(estado) || 0) + 1);
              });
              
              return Array.from(porEstado.entries())
                .map(([nome, count]) => ({
                  nome,
                  count,
                  percent: (count / processosFiltrados.length) * 100,
                }))
                .sort((a, b) => b.count - a.count)
                .map((est, i) => (
                  <div key={i} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900">{est.nome}</span>
                      <span className="text-sm text-slate-600">{est.count} processos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${est.percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{fmtPercent(est.percent)}</span>
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
