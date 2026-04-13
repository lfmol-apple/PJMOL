// 🎯 SISTEMA SIMPLIFICADO - SÓ STATUS
// Removidos: timers, cálculos de duração, hooks complexos
// Agora: apenas mostra a fase atual com cores

type ProcessTimelineProps = {
  fase_atual?: string;
  status?: string;
};

export function ProcessTimeline({ fase_atual, status }: ProcessTimelineProps) {
  // Sistema simplificado: apenas mostra a fase atual
  const fase = fase_atual || 'enviado';
  
  // Mapeamento de cores
  const cores = {
    'enviado': {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-300',
      label: '🔴 Aguardando Assinatura',
      emoji: '📤'
    },
    'assinado': {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-300',
      label: '🟠 Gerente Anexando Docs',
      emoji: '✍️'
    },
    'com_advogado': {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-300',
      label: '🟡 Com Advogado',
      emoji: '⚖️'
    },
    'finalizado': {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-300',
      label: '🟢 Finalizado',
      emoji: '✅'
    }
  };

  const estilo = cores[fase as keyof typeof cores] || cores.enviado;

  return (
    <div className="flex flex-col gap-1">
      <div className={`rounded-lg px-3 py-2 text-sm font-semibold text-center ${estilo.bg} ${estilo.text} border-2 ${estilo.border}`}>
        <div className="text-lg mb-1">{estilo.emoji}</div>
        <div>{estilo.label}</div>
      </div>
      {status === 'Salvo' && (
        <div className="text-center text-[10px] text-gray-500 italic">
          💾 Salvo (não enviado)
        </div>
      )}
    </div>
  );
}