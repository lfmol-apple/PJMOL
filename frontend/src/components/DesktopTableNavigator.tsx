"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, ChevronRight, 
  Maximize2, Minimize2,
  Navigation, Target, MousePointer2, Eye
} from 'lucide-react';

interface NavigatorProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function DesktopTableNavigator({ containerRef }: NavigatorProps) {
  const [scrollInfo, setScrollInfo] = useState({ left: 0, width: 0, maxScroll: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const [quickJumpTarget, setQuickJumpTarget] = useState<number>(0);
  
  // Pontos de navegação rápida (baseados nas colunas)
  const quickJumpPoints = [
    { label: 'Início', icon: Target, position: 0 },
    { label: 'Cliente', icon: Eye, position: 0.15 },
    { label: 'Valores', icon: MousePointer2, position: 0.45 },
    { label: 'Honorários', icon: Navigation, position: 0.65 },
    { label: 'Timeline', icon: Target, position: 0.8 },
    { label: 'Final', icon: Target, position: 1 }
  ];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('DesktopTableNavigator: Container not found');
      return;
    }
    
    console.log('DesktopTableNavigator: Container found', {
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      element: container
    });
    
    const updateScrollInfo = () => {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const newScrollInfo = {
        left: container.scrollLeft,
        width: container.clientWidth,
        maxScroll
      };
      
      console.log('Scroll Info Updated:', newScrollInfo);
      setScrollInfo(newScrollInfo);
    };
    
    updateScrollInfo();
    container.addEventListener('scroll', updateScrollInfo);
    window.addEventListener('resize', updateScrollInfo);
    
    // Adicionar um timeout para verificar após o carregamento
    const timeoutId = setTimeout(updateScrollInfo, 1000);
    
    return () => {
      container.removeEventListener('scroll', updateScrollInfo);
      window.removeEventListener('resize', updateScrollInfo);
      clearTimeout(timeoutId);
    };
  }, [containerRef]);

  const scrollTo = (position: number) => {
    const container = containerRef.current;
    if (!container) {
      console.log('ScrollTo: Container not found');
      return;
    }
    
    const targetScroll = position * scrollInfo.maxScroll;
    console.log('ScrollTo called:', { position, targetScroll, maxScroll: scrollInfo.maxScroll });
    
    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

  const scrollStep = (direction: 'left' | 'right') => {
    const container = containerRef.current;
    if (!container) return;
    
    const step = scrollInfo.width * 0.8; // 80% da largura visível
    const newScroll = direction === 'left' 
      ? Math.max(0, scrollInfo.left - step)
      : Math.min(scrollInfo.maxScroll, scrollInfo.left + step);
    
    container.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
  };

  const currentProgress = scrollInfo.maxScroll > 0 
    ? scrollInfo.left / scrollInfo.maxScroll 
    : 0;

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-800 transition-colors"
        title="Mostrar navegador de tabela"
      >
        <Navigation className="h-4 w-4" />
      </button>
    );
  }

  // Debug info
  const hasContainer = !!containerRef.current;
  const canScroll = scrollInfo.maxScroll > 0;

  return (
    <div className="hidden md:block fixed bottom-4 right-4 z-50">
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-80">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Navigation className="h-4 w-4" />
            Navegador de Tabela
            {!hasContainer && <span className="text-red-500 text-xs">(Sem container)</span>}
            {hasContainer && !canScroll && <span className="text-orange-500 text-xs">(Sem scroll)</span>}
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            title="Ocultar navegador"
          >
            <Minimize2 className="h-3 w-3" />
          </button>
        </div>

        {/* Barra de progresso */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Posição na tabela</span>
            <span>{Math.round(currentProgress * 100)}%</span>
          </div>
          <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, currentProgress * 100)}%` }}
            />
          </div>
        </div>

        {/* Controles de navegação por passos */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => scrollStep('left')}
            disabled={scrollInfo.left <= 0}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 rounded transition-colors"
            title="Voltar uma tela"
          >
            <ChevronLeft className="h-3 w-3" />
            Voltar
          </button>
          
          <div className="flex-1 text-center text-xs text-slate-500">
            {scrollInfo.maxScroll > 0 ? (
              <>Scroll: {Math.round(scrollInfo.left)}px de {Math.round(scrollInfo.maxScroll)}px</>
            ) : (
              hasContainer ? 'Tabela cabe na tela' : 'Container não encontrado'
            )}
          </div>
          
          <button
            onClick={() => scrollStep('right')}
            disabled={scrollInfo.left >= scrollInfo.maxScroll}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 rounded transition-colors"
            title="Avançar uma tela"
          >
            Avançar
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Pontos de navegação rápida */}
        <div className="space-y-1">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-slate-600">Pular para:</div>
            <button 
              onClick={() => {
                console.log('Teste manual - Container:', containerRef.current);
                if (containerRef.current) {
                  console.log('ScrollWidth:', containerRef.current.scrollWidth, 'ClientWidth:', containerRef.current.clientWidth);
                  containerRef.current.scrollLeft = 100;
                }
              }}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
            >
              Teste
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {quickJumpPoints.map((point) => {
              const Icon = point.icon;
              const isActive = Math.abs(currentProgress - point.position) < 0.1;
              
              return (
                <button
                  key={point.label}
                  onClick={() => scrollTo(point.position)}
                  className={`
                    flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all
                    ${isActive 
                      ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }
                  `}
                  title={`Ir para seção: ${point.label}`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{point.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini-mapa da tabela */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-600 mb-2">Mini-mapa</div>
          <div className="relative h-3 bg-slate-100 rounded overflow-hidden cursor-pointer"
               onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const percentage = x / rect.width;
                 scrollTo(percentage);
               }}>
            {/* Área visível */}
            <div 
              className="absolute top-0 h-full bg-emerald-200 rounded"
              style={{
                left: `${currentProgress * 100}%`,
                width: scrollInfo.maxScroll > 0 
                  ? `${Math.max(5, (scrollInfo.width / (scrollInfo.width + scrollInfo.maxScroll)) * 100)}%`
                  : '100%'
              }}
            />
            {/* Indicador de posição */}
            <div 
              className="absolute top-0 w-0.5 h-full bg-emerald-600"
              style={{ left: `${currentProgress * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Início</span>
            <span>Fim</span>
          </div>
        </div>
      </div>
    </div>
  );
}