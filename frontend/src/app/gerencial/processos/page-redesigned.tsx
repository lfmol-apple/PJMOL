/**
 * VERSÃO REDESENHADA - Layout Desktop Otimizado
 * - Melhor organização das colunas com agrupamento lógico
 * - Navegação horizontal mais intuitiva
 * - Melhor uso do espaço em telas desktop
 */

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { 
  Search, Filter, Download, Settings, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Paperclip, AlertCircle, CheckCircle2, Plus, Trash2,
  FileText, Calendar, User, Building, Calculator,
  Clock, ArrowLeft, ArrowRight, Maximize2
} from "lucide-react";

// Definir os grupos de colunas para melhor organização
const COLUMN_GROUPS = {
  essential: {
    title: "Informações Essenciais",
    icon: FileText,
    columns: ["anexos", "status", "id", "nome_cliente", "numero_processo"]
  },
  classification: {
    title: "Classificação",
    icon: Building,
    columns: ["grupo", "cota", "administradora", "advogado_nome", "gerente_nome"]
  },
  values: {
    title: "Valores Financeiros",
    icon: Calculator,
    columns: ["valor_corrigido_hoje", "valor_futuro", "liquido_hoje", "liquido_futuro"]
  },
  fees: {
    title: "Honorários",
    icon: Calculator,
    columns: ["honorarios_hoje_total", "honorarios_futuro_total"]
  },
  timeline: {
    title: "Timeline & Status",
    icon: Clock,
    columns: ["_aguardando_adv", "_resultado", "criado_em"]
  },
  actions: {
    title: "Ações",
    icon: Settings,
    columns: ["acoes"]
  }
};

// Componente de controle de navegação horizontal
function HorizontalNavigator({ 
  currentGroup, 
  groups, 
  onGroupChange,
  containerRef 
}: {
  currentGroup: string;
  groups: typeof COLUMN_GROUPS;
  onGroupChange: (groupKey: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const groupKeys = Object.keys(groups);
  const currentIndex = groupKeys.indexOf(currentGroup);
  
  const navigateToGroup = (direction: 'prev' | 'next') => {
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : groupKeys.length - 1;
    } else {
      newIndex = currentIndex < groupKeys.length - 1 ? currentIndex + 1 : 0;
    }
    onGroupChange(groupKeys[newIndex]);
  };

  return (
    <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-lg p-2">
      <button
        onClick={() => navigateToGroup('prev')}
        className="p-1.5 rounded hover:bg-white text-slate-600 hover:text-slate-900"
        title="Grupo anterior (Seta Esquerda)"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      
      <div className="flex items-center gap-1">
        {Object.entries(groups).map(([key, group]) => {
          const Icon = group.icon;
          const isActive = key === currentGroup;
          return (
            <button
              key={key}
              onClick={() => onGroupChange(key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }
              `}
              title={group.title}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{group.title}</span>
            </button>
          );
        })}
      </div>
      
      <button
        onClick={() => navigateToGroup('next')}
        className="p-1.5 rounded hover:bg-white text-slate-600 hover:text-slate-900"
        title="Próximo grupo (Seta Direita)"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      
      <div className="ml-2 pl-2 border-l border-slate-300 text-xs text-slate-500">
        {currentIndex + 1} de {groupKeys.length}
      </div>
    </div>
  );
}

// Componente de indicador de scroll
function ScrollIndicator({ 
  containerRef,
  currentGroup 
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentGroup: string;
}) {
  const [scrollInfo, setScrollInfo] = useState({ left: 0, width: 0, maxScroll: 0 });
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const updateScrollInfo = () => {
      setScrollInfo({
        left: container.scrollLeft,
        width: container.clientWidth,
        maxScroll: container.scrollWidth - container.clientWidth
      });
    };
    
    updateScrollInfo();
    container.addEventListener('scroll', updateScrollInfo);
    window.addEventListener('resize', updateScrollInfo);
    
    return () => {
      container.removeEventListener('scroll', updateScrollInfo);
      window.removeEventListener('resize', updateScrollInfo);
    };
  }, [containerRef]);
  
  const scrollPercentage = scrollInfo.maxScroll > 0 
    ? (scrollInfo.left / scrollInfo.maxScroll) * 100 
    : 0;
  
  return (
    <div className="hidden md:block w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
      <div 
        className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.max(10, scrollPercentage)}%` }}
      />
    </div>
  );
}

// Componente principal (cópia da estrutura original com melhorias)
export default function GerencialProcessosPageRedesigned() {
  // Estados originais (mantidos para compatibilidade)
  const [perfil, setPerfil] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  
  // Filtros UI (mantidos)
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [adm, setAdm] = useState<string>("");
  const [resultado, setResultado] = useState<string>("");
  const [gerenteFilter, setGerenteFilter] = useState<string>("");
  const [advogadoFilter, setAdvogadoFilter] = useState<string>("");
  
  // Estados para navegação otimizada
  const [currentGroup, setCurrentGroup] = useState('essential');
  const [isFullWidth, setIsFullWidth] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Navegação por teclado aprimorada
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      
      const groupKeys = Object.keys(COLUMN_GROUPS);
      const currentIndex = groupKeys.indexOf(currentGroup);
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : groupKeys.length - 1;
          setCurrentGroup(groupKeys[prevIndex]);
          break;
        case 'ArrowRight':
          e.preventDefault();
          const nextIndex = currentIndex < groupKeys.length - 1 ? currentIndex + 1 : 0;
          setCurrentGroup(groupKeys[nextIndex]);
          break;
        case 'f':
        case 'F':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setIsFullWidth(!isFullWidth);
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentGroup, isFullWidth]);

  // Colunas visíveis baseadas no grupo atual
  const visibleColumns = useMemo(() => {
    return COLUMN_GROUPS[currentGroup as keyof typeof COLUMN_GROUPS]?.columns || [];
  }, [currentGroup]);

  // Dados mockados para demonstração (substituir pela lógica real)
  const mockData = useMemo(() => [
    {
      id: 1,
      nome_cliente: "João Silva Santos",
      numero_processo: "1234567-89.2023.8.13.0001",
      status: "Enviado",
      grupo: "A1",
      cota: "123",
      administradora: "Consórcio Nacional Honda",
      valor_corrigido_hoje: 45000,
      valor_futuro: 52000,
      honorarios_hoje_total: 9000,
      honorarios_futuro_total: 10400,
      liquido_hoje: 36000,
      liquido_futuro: 41600,
      advogado_nome: "Dr. Maria Oliveira",
      gerente_nome: "Carlos Santos",
      criado_em: "2024-01-15",
      _resultado: "Acordo",
      _aguardando_adv: "Análise"
    },
    {
      id: 2,
      nome_cliente: "Ana Costa Ferreira",
      numero_processo: "9876543-21.2023.8.13.0002",
      status: "Assinado",
      grupo: "B2",
      cota: "456",
      administradora: "Consórcio Chevrolet",
      valor_corrigido_hoje: 38000,
      valor_futuro: 44000,
      honorarios_hoje_total: 7600,
      honorarios_futuro_total: 8800,
      liquido_hoje: 30400,
      liquido_futuro: 35200,
      advogado_nome: "Dr. Pedro Lima",
      gerente_nome: "Fernanda Costa",
      criado_em: "2024-01-10",
      _resultado: "Sentença à Vista",
      _aguardando_adv: "Finalizado"
    }
  ], []);

  const handleGroupNavigation = (groupKey: string) => {
    setCurrentGroup(groupKey);
    
    // Scroll suave para o grupo
    if (tableContainerRef.current) {
      const container = tableContainerRef.current;
      const groupElement = container.querySelector(`[data-group="${groupKey}"]`);
      if (groupElement) {
        groupElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  };

  const fmtBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const fmtDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <div className={`min-h-screen bg-slate-50 ${isFullWidth ? 'p-2' : 'p-4'}`}>
      {/* Header com controles aprimorados */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Processos - Layout Otimizado</h1>
            <p className="text-slate-600 text-sm mt-1">
              Use as setas ← → para navegar entre grupos ou Ctrl+F para tela cheia
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsFullWidth(!isFullWidth)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Alternar tela cheia (Ctrl+F)"
            >
              <Maximize2 className="h-4 w-4" />
              {isFullWidth ? 'Normal' : 'Tela Cheia'}
            </button>
            
            <Link
              href="/gerencial/processos"
              className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Versão Original
            </Link>
          </div>
        </div>

        {/* Navegador horizontal */}
        <div className="flex flex-col gap-3">
          <HorizontalNavigator
            currentGroup={currentGroup}
            groups={COLUMN_GROUPS}
            onGroupChange={handleGroupNavigation}
            containerRef={tableContainerRef}
          />
          
          <ScrollIndicator 
            containerRef={tableContainerRef}
            currentGroup={currentGroup}
          />
        </div>

        {/* Filtros simplificados */}
        <div className="flex flex-wrap gap-2 mt-4">
          <input
            type="text"
            placeholder="Buscar processos..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todos os status</option>
            <option value="enviado">Enviado</option>
            <option value="assinado">Assinado</option>
            <option value="salvo">Salvo</option>
          </select>
        </div>
      </div>

      {/* Tabela otimizada */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div 
          ref={tableContainerRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ 
            scrollBehavior: 'smooth',
            scrollbarWidth: 'thin'
          }}
        >
          <table className="w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                {/* Grupo atual destacado */}
                <th 
                  colSpan={visibleColumns.length}
                  className="px-4 py-3 text-left bg-gradient-to-r from-emerald-50 to-emerald-100 border-b-2 border-emerald-200"
                >
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                    {React.createElement(COLUMN_GROUPS[currentGroup as keyof typeof COLUMN_GROUPS].icon, { 
                      className: "h-4 w-4" 
                    })}
                    {COLUMN_GROUPS[currentGroup as keyof typeof COLUMN_GROUPS].title}
                    <span className="text-xs font-normal text-emerald-600">
                      ({visibleColumns.length} colunas)
                    </span>
                  </div>
                </th>
              </tr>
              
              <tr className="text-xs text-slate-600">
                {visibleColumns.map((col) => (
                  <th 
                    key={col}
                    className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-slate-200"
                    data-group={currentGroup}
                  >
                    {col === 'anexos' && 'Anexos'}
                    {col === 'status' && 'Status'}
                    {col === 'id' && 'ID'}
                    {col === 'nome_cliente' && 'Cliente'}
                    {col === 'numero_processo' && 'Número do Processo'}
                    {col === 'grupo' && 'Grupo'}
                    {col === 'cota' && 'Cota'}
                    {col === 'administradora' && 'Administradora'}
                    {col === 'valor_corrigido_hoje' && 'Valor Hoje'}
                    {col === 'valor_futuro' && 'Valor Futuro'}
                    {col === 'honorarios_hoje_total' && 'Honorários Hoje'}
                    {col === 'honorarios_futuro_total' && 'Honorários Futuro'}
                    {col === 'liquido_hoje' && 'Líquido Hoje'}
                    {col === 'liquido_futuro' && 'Líquido Futuro'}
                    {col === 'advogado_nome' && 'Advogado'}
                    {col === 'gerente_nome' && 'Gerente'}
                    {col === 'criado_em' && 'Criado em'}
                    {col === '_resultado' && 'Resultado'}
                    {col === '_aguardando_adv' && 'Etapa'}
                    {col === 'acoes' && 'Ações'}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {mockData.map((item) => (
                <tr 
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  {visibleColumns.map((col) => (
                    <td 
                      key={col}
                      className="px-3 py-3 text-sm whitespace-nowrap"
                    >
                      {col === 'anexos' && (
                        <button className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                          <Paperclip className="h-3 w-3" />
                          Ver
                        </button>
                      )}
                      {col === 'status' && (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                          {item.status}
                        </span>
                      )}
                      {col === 'id' && (
                        <span className="font-medium text-slate-900">{item.id}</span>
                      )}
                      {col === 'nome_cliente' && (
                        <div className="max-w-48 truncate" title={item.nome_cliente}>
                          {item.nome_cliente}
                        </div>
                      )}
                      {col === 'numero_processo' && (
                        <div className="font-mono text-xs max-w-44 truncate" title={item.numero_processo}>
                          {item.numero_processo}
                        </div>
                      )}
                      {(col === 'valor_corrigido_hoje' || col === 'valor_futuro' || 
                        col === 'honorarios_hoje_total' || col === 'honorarios_futuro_total' ||
                        col === 'liquido_hoje' || col === 'liquido_futuro') && (
                        <span className="font-medium text-slate-900 tabular-nums">
                          {fmtBRL(item[col as keyof typeof item] as number)}
                        </span>
                      )}
                      {col === 'criado_em' && fmtDate(item.criado_em)}
                      {col === '_resultado' && (
                        <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                          {item._resultado}
                        </span>
                      )}
                      {(col === 'grupo' || col === 'cota' || col === 'administradora' || 
                        col === 'advogado_nome' || col === 'gerente_nome' || col === '_aguardando_adv') && (
                        <span>{item[col as keyof typeof item] as string}</span>
                      )}
                      {col === 'acoes' && (
                        <div className="flex gap-1">
                          <button className="px-2 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">
                            Ver
                          </button>
                          <button className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer com informações do grupo */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div>
              Visualizando: <strong>{COLUMN_GROUPS[currentGroup as keyof typeof COLUMN_GROUPS].title}</strong>
            </div>
            <div className="flex items-center gap-4">
              <span>2 registros encontrados</span>
              <div className="text-xs">
                Use ← → para navegar entre grupos
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}