// @ts-nocheck
"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Users, FileText, CheckCircle, Clock, AlertCircle, BarChart3, PieChart } from "lucide-react";
import { getLoggedUser, getToken, filterByScope, canSeeAll } from "@/app/lib/auth";
import dynamic from 'next/dynamic';

// Importação dinâmica dos gráficos para evitar problemas de SSR
const Chart = dynamic(() => import('react-chartjs-2').then(mod => mod.Pie), { ssr: false });
const BarChart = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false });

// Registrar os componentes do Chart.js apenas no cliente
const ChartJS = dynamic(() => import('chart.js').then(mod => {
  const {
    Chart,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
  } = mod;
  
  Chart.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
  );
  
  return Promise.resolve(Chart);
}), { ssr: false });

// Componente de gráfico de pizza para status dos processos
const StatusPieChart = dynamic(() => 
  import('chart.js').then(async (ChartJS) => {
    const { Chart, ArcElement, Tooltip, Legend } = ChartJS;
    Chart.register(ArcElement, Tooltip, Legend);
    
    const { Pie } = await import('react-chartjs-2');
    
    return function StatusPieChartComponent({ grupos }: any) {
      const [isClient, setIsClient] = useState(false);

      useEffect(() => {
        setIsClient(true);
      }, []);

      if (!isClient) {
        return (
          <div style={{ height: '300px' }} className="flex items-center justify-center">
            <div className="text-slate-500">Carregando gráfico...</div>
          </div>
        );
      }

      const data = {
        labels: [
          'Enviados para Assinatura',
          'Aguardando Advogado', 
          'Aguardando Gerente',
          'Concluídos sem Decisão',
          'Com Decisão'
        ],
        datasets: [
          {
            data: [
              grupos.enviadosAssinatura.length,
              grupos.aguardandoAdvogado.length,
              grupos.aguardandoGerente.length,
              grupos.concluidos.length,
              grupos.comDecisao.length,
            ],
            backgroundColor: [
              'rgba(59, 130, 246, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(249, 115, 22, 0.8)',
              'rgba(34, 197, 94, 0.8)',
              'rgba(16, 185, 129, 0.8)',
            ],
            borderColor: [
              'rgba(59, 130, 246, 1)',
              'rgba(245, 158, 11, 1)',
              'rgba(249, 115, 22, 1)',
              'rgba(34, 197, 94, 1)',
              'rgba(16, 185, 129, 1)',
            ],
            borderWidth: 2,
          },
        ],
      };

      const options = {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom' as const,
            labels: {
              boxWidth: 12,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
        },
        maintainAspectRatio: false,
      };

      return (
        <div style={{ height: '300px' }}>
          <Pie data={data} options={options} />
        </div>
      );
    };
  }), 
  { ssr: false }
);

// Componente de gráfico de barras para valores por gerente
const GerenteValoresChart = dynamic(() => 
  import('chart.js').then(async (ChartJS) => {
    const { Chart, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } = ChartJS;
    Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
    
    const { Bar } = await import('react-chartjs-2');
    
    return function GerenteValoresChartComponent({ estatisticasPorGerente }: any) {
      const [isClient, setIsClient] = useState(false);

      useEffect(() => {
        setIsClient(true);
      }, []);

      if (!isClient) {
        return (
          <div style={{ height: '300px' }} className="flex items-center justify-center">
            <div className="text-slate-500">Carregando gráfico...</div>
          </div>
        );
      }

      const data = {
        labels: estatisticasPorGerente.map((g: any) => g.nome.length > 12 ? g.nome.substring(0, 12) + '...' : g.nome),
        datasets: [
          {
            label: 'Valores Enviados',
            data: estatisticasPorGerente.map((g: any) => g.valorEnviados),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
          },
          {
            label: 'Valores Assinados',
            data: estatisticasPorGerente.map((g: any) => g.valorAssinados),
            backgroundColor: 'rgba(34, 197, 94, 0.8)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 1,
          },
          {
            label: 'Valores Concluídos',
            data: estatisticasPorGerente.map((g: any) => g.valorConcluidos),
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderColor: 'rgba(16, 185, 129, 1)',
            borderWidth: 1,
          },
        ],
      };

      const options = {
        responsive: true,
        plugins: {
          legend: {
            position: 'top' as const,
            labels: {
              boxWidth: 12,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                return `${context.dataset.label}: ${new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                }).format(context.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  notation: 'compact'
                }).format(value);
              }
            }
          },
          x: {
            ticks: {
              maxRotation: 45,
              font: {
                size: 10
              }
            }
          }
        },
        maintainAspectRatio: false,
      };

      return (
        <div style={{ height: '300px' }}>
          <Bar data={data} options={options} />
        </div>
      );
    };
  }), 
  { ssr: false }
);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

// Função para saudação baseada no horário
function getSaudacao(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Função para formatar valor em BRL
function fmtBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

// Função para obter status do processo
function getDisplayStatus(processo: any): string {
  if (processo?.signed_external) return 'Assinado (fora)';
  if (processo?.assinado_cliente && processo?.assinado_advogado) return 'Assinado';
  if (processo?.enviado_advogado && !processo?.assinado_advogado) return 'Aguardando Advogado';
  if (processo?.assinado_cliente && !processo?.enviado_advogado) return 'Aguardando Gerente';
  if (processo?.enviado_assinatura && !processo?.assinado_cliente) return 'Enviado para Assinatura';
  if (processo?.salvo && !processo?.enviado_assinatura) return 'Aguardando Gerente';
  return 'Rascunho';
}

// Função para obter resultado
function getResultadoLabel(processo: any): string {
  const resultado = processo?.resultado || processo?.decisao;
  if (resultado === 'acordo') return 'Acordo';
  if (resultado === 'sentenca_a_vista') return 'Sentença à Vista';
  return resultado || 'Aguardando decisão';
}

interface ProcessoGrupo {
  cliente: string;
  administradora: string;
  valorCausa: number;
  advogado?: string;
  gerente?: string;
  resultado?: string;
}

export default function DashboardRelatorioPage() {
  const [loading, setLoading] = useState(true);
  const [processos, setProcessos] = useState<any[]>([]);
  const [usuario, setUsuario] = useState<any>(null);

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

  // Agrupar processos por status
  const grupos = useMemo(() => {
    const processosEnviadosAssinatura = processos.filter(p => 
      getDisplayStatus(p) === 'Enviado para Assinatura'
    );

    const processosAguardandoAdvogado = processos.filter(p => 
      getDisplayStatus(p) === 'Aguardando Advogado'
    );

    const processosAguardandoGerente = processos.filter(p => 
      getDisplayStatus(p) === 'Aguardando Gerente'
    );

    const processosConcluidos = processos.filter(p => 
      getDisplayStatus(p) === 'Assinado' || getDisplayStatus(p) === 'Assinado (fora)'
    );

    const processosComDecisao = processosConcluidos.filter(p => {
      const resultado = getResultadoLabel(p);
      return resultado === 'Acordo' || resultado === 'Sentença à Vista';
    });

    const processosSemDecisao = processosConcluidos.filter(p => {
      const resultado = getResultadoLabel(p);
      return resultado === 'Aguardando decisão';
    });

    // Função para ordenar e agrupar
    const ordenarEAgrupar = (lista: any[]): ProcessoGrupo[] => {
      return lista
        .map(p => ({
          cliente: p.nome_cliente || '',
          administradora: p.administradora || '',
          valorCausa: Number(p.valor_causa) || 0,
          advogado: p.advogado_nome || p.advogado_usuario || '',
          gerente: p.gerente_nome || p.criado_por_nome || '',
          resultado: getResultadoLabel(p)
        }))
        .sort((a, b) => a.cliente.localeCompare(b.cliente))
        .sort((a, b) => a.administradora.localeCompare(b.administradora));
    };

    return {
      enviadosAssinatura: ordenarEAgrupar(processosEnviadosAssinatura),
      aguardandoAdvogado: ordenarEAgrupar(processosAguardandoAdvogado),
      aguardandoGerente: ordenarEAgrupar(processosAguardandoGerente),
      concluidos: ordenarEAgrupar(processosSemDecisao),
      comDecisao: ordenarEAgrupar(processosComDecisao)
    };
  }, [processos]);

  // Estatísticas do mês atual
  const estatisticasMes = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    
    const processosDoMes = processos.filter(p => {
      const dataCriacao = new Date(p.criado_em || p.data_exportacao);
      return dataCriacao >= inicioMes;
    });

    return {
      totalMes: processosDoMes.length,
      processos: processosDoMes
    };
  }, [processos]);

  // Estatísticas por gerente
  const estatisticasPorGerente = useMemo(() => {
    const gerentes = new Map();

    processos.forEach(p => {
      const nomeGerente = p.gerente_nome || p.criado_por_nome || 'Sem gerente';
      const status = getDisplayStatus(p);
      const valorCausa = Number(p.valor_causa) || 0;

      if (!gerentes.has(nomeGerente)) {
        gerentes.set(nomeGerente, {
          nome: nomeGerente,
          enviados: 0,
          valorEnviados: 0,
          assinados: 0,
          valorAssinados: 0,
          concluidos: 0,
          valorConcluidos: 0
        });
      }

      const gerente = gerentes.get(nomeGerente);

      if (status === 'Enviado para Assinatura') {
        gerente.enviados++;
        gerente.valorEnviados += valorCausa;
      }

      if (status === 'Assinado' || status === 'Assinado (fora)') {
        gerente.assinados++;
        gerente.valorAssinados += valorCausa;
        gerente.concluidos++;
        gerente.valorConcluidos += valorCausa;
      }
    });

    return Array.from(gerentes.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [processos]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  const saudacao = getSaudacao();
  const nomeUsuario = usuario?.nome || usuario?.username || 'Usuário';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/gerencial/processos"
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Voltar para Processos</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-slate-900">
                Relatório de Processos
              </h1>
              {usuario && (
                <div className="text-sm text-slate-600">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    canSeeAll(usuario.perfil) 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {canSeeAll(usuario.perfil) ? 'Visão Completa (Admin)' : `Meus Processos (${usuario.perfil})`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Saudação */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {saudacao}, {nomeUsuario}!
          </h2>
          <p className="text-slate-600">
            Segue o relatório de seus processos:
          </p>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-slate-500 truncate">
                    Enviados para Assinatura
                  </dt>
                  <dd className="text-lg font-medium text-slate-900">
                    {grupos.enviadosAssinatura.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-slate-500 truncate">
                    Aguardando Advogado
                  </dt>
                  <dd className="text-lg font-medium text-slate-900">
                    {grupos.aguardandoAdvogado.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-8 w-8 text-orange-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-slate-500 truncate">
                    Aguardando Gerente
                  </dt>
                  <dd className="text-lg font-medium text-slate-900">
                    {grupos.aguardandoGerente.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-slate-500 truncate">
                    Concluídos
                  </dt>
                  <dd className="text-lg font-medium text-slate-900">
                    {grupos.concluidos.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-slate-500 truncate">
                    Com Decisão
                  </dt>
                  <dd className="text-lg font-medium text-slate-900">
                    {grupos.comDecisao.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Gráfico de Status dos Processos */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-slate-900">
                Distribuição por Status
              </h3>
            </div>
            <StatusPieChart grupos={grupos} />
          </div>

          {/* Gráfico de Valores por Gerente */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-slate-900">
                Valores por Gerente
              </h3>
            </div>
            <GerenteValoresChart estatisticasPorGerente={estatisticasPorGerente} />
          </div>
        </div>

        {/* Seções Detalhadas */}
        <div className="space-y-8">
          {/* Processos Enviados para Assinatura */}
          {grupos.enviadosAssinatura.length > 0 && (
            <ProcessosSection
              titulo={`${grupos.enviadosAssinatura.length} processos enviados para assinatura:`}
              processos={grupos.enviadosAssinatura}
              mostrarAdvogado={false}
              mostrarGerente={false}
              mostrarResultado={false}
            />
          )}

          {/* Processos Aguardando Advogado */}
          {grupos.aguardandoAdvogado.length > 0 && (
            <ProcessosSection
              titulo={`${grupos.aguardandoAdvogado.length} processos aguardando advogado:`}
              processos={grupos.aguardandoAdvogado}
              mostrarAdvogado={true}
              mostrarGerente={false}
              mostrarResultado={false}
            />
          )}

          {/* Processos Aguardando Gerente */}
          {grupos.aguardandoGerente.length > 0 && (
            <ProcessosSection
              titulo={`${grupos.aguardandoGerente.length} processos aguardando ação do Gerente:`}
              processos={grupos.aguardandoGerente}
              mostrarAdvogado={false}
              mostrarGerente={true}
              mostrarResultado={false}
            />
          )}

          {/* Processos Concluídos Aguardando Decisão */}
          {grupos.concluidos.length > 0 && (
            <ProcessosSection
              titulo={`${grupos.concluidos.length} processos concluídos ou salvos aguardando decisão:`}
              processos={grupos.concluidos}
              mostrarAdvogado={false}
              mostrarGerente={false}
              mostrarResultado={true}
            />
          )}

          {/* Processos Com Decisão */}
          {grupos.comDecisao.length > 0 && (
            <ProcessosSection
              titulo={`${grupos.comDecisao.length} processos concluídos ou salvos com decisão (Sentença à vista ou Acordo):`}
              processos={grupos.comDecisao}
              mostrarAdvogado={false}
              mostrarGerente={false}
              mostrarResultado={true}
            />
          )}

          {/* Estatísticas do Mês */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Estatísticas do Mês
            </h3>
            <p className="text-slate-700">
              Neste mês foram gerados <span className="font-semibold text-blue-600">{estatisticasMes.totalMes}</span> processos
            </p>
          </div>

          {/* Estatísticas por Gerente */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              Estatísticas por Gerente
            </h3>
            <div className="space-y-4">
              {estatisticasPorGerente.map((gerente, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-medium text-slate-900 mb-2">{gerente.nome}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">Enviados:</span>
                      <span className="ml-2 font-medium">{gerente.enviados} processos</span>
                      <div className="text-blue-600">{fmtBRL(gerente.valorEnviados)}</div>
                    </div>
                    <div>
                      <span className="text-slate-600">Assinados:</span>
                      <span className="ml-2 font-medium">{gerente.assinados} processos</span>
                      <div className="text-green-600">{fmtBRL(gerente.valorAssinados)}</div>
                    </div>
                    <div>
                      <span className="text-slate-600">Concluídos:</span>
                      <span className="ml-2 font-medium">{gerente.concluidos} processos</span>
                      <div className="text-emerald-600">{fmtBRL(gerente.valorConcluidos)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente para exibir seções de processos
interface ProcessosSectionProps {
  titulo: string;
  processos: ProcessoGrupo[];
  mostrarAdvogado: boolean;
  mostrarGerente: boolean;
  mostrarResultado: boolean;
}

function ProcessosSection({ 
  titulo, 
  processos, 
  mostrarAdvogado, 
  mostrarGerente, 
  mostrarResultado 
}: ProcessosSectionProps) {
  const somaTotal = processos.reduce((acc, p) => acc + p.valorCausa, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        {titulo}
      </h3>
      
      <div className="space-y-2 mb-4">
        {processos.map((processo, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
            <div className="flex-1">
              <span className="font-medium text-slate-900">{processo.cliente}</span>
              <span className="text-slate-600 ml-2">• {processo.administradora}</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="font-medium text-blue-600">
                {fmtBRL(processo.valorCausa)}
              </span>
              
              {mostrarAdvogado && processo.advogado && (
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {processo.advogado}
                </span>
              )}
              
              {mostrarGerente && processo.gerente && (
                <span className="text-sm bg-orange-100 text-orange-800 px-2 py-1 rounded">
                  {processo.gerente}
                </span>
              )}
              
              {mostrarResultado && (
                <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                  {processo.resultado}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="border-t border-slate-200 pt-4">
        <div className="flex justify-end">
          <div className="text-right">
            <div className="text-sm text-slate-600">Total do Valor da Causa</div>
          </div>
        </div>
      </div>
    </div>
  );
}