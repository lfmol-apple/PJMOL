import { useMemo } from 'react';

type Props = {
  status: string;
  timestamp: string | null;
  className?: string;
}

export function StatusColumn({ status, timestamp, className = '' }: Props) {
  const formattedTime = useMemo(() => {
    if (!timestamp) return '';
    
    let date: Date;
    
    // Se o timestamp não tem timezone, assumir que está em UTC e converter para brasileiro
    if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-')) {
      // Já tem timezone, usar diretamente
      date = new Date(timestamp);
    } else {
      // Não tem timezone, assumir UTC e converter para brasileiro
      date = new Date(timestamp + 'Z');
    }
    
    if (Number.isNaN(date.getTime())) return '';
    
    // Formato: DD/MM/YYYY HH:MM:SS (horário brasileiro UTC-3)
    // Usa toLocaleString para garantir fuso horário correto
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    return date.toLocaleString('pt-BR', options);
  }, [timestamp]);

  return (
    <div className={`flex flex-col items-center text-center min-w-[140px] w-full ${className}`}>
      <div className={getStatusClass(status)}>
        {status || '—'}
      </div>
      {formattedTime && (
        <div className="mt-1 text-[10px] text-gray-600 font-normal">
          {formattedTime}
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  "Concluído": "bg-green-100 text-green-800 ring-green-600/30 font-semibold",
  "Ganhamos": "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  "Perdemos": "bg-rose-100 text-rose-700 ring-rose-600/20", 
  "Em Andamento": "bg-amber-100 text-amber-700 ring-amber-600/20",
  "Enviado": "bg-blue-100 text-blue-700 ring-blue-600/20",
  "Assinado": "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  "Assinado (fora)": "bg-teal-100 text-teal-700 ring-teal-600/20",
  "Com Advogado": "bg-purple-100 text-purple-700 ring-purple-600/20",
  "Aguardando Assinatura": "bg-orange-100 text-orange-700 ring-orange-600/20",
  "Cancelado": "bg-slate-200 text-slate-700 ring-slate-400/20"
};

function getStatusClass(status: string): string {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
  return `${base} ${STATUS_COLORS[status] || "bg-slate-100 text-slate-700 ring-slate-500/20"}`;
}