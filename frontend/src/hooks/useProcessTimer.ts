import { useEffect, useRef, useState } from 'react';

type TimelineStatus = {
  isActive: boolean;
  duration: string;
  startTime: Date | null;
  endTime: Date | null;
};

export function useProcessTimer(
  startTimestamp: string | null | undefined,
  endTimestamp: string | null | undefined,
  isCompleted: boolean,
  isPaused: boolean = false
): TimelineStatus {
  const [duration, setDuration] = useState('');
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!startTimestamp || startTimestamp === undefined) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setDuration('');
      return;
    }

    // Se está pausado, para o timer e mostra apenas "Pausado"
    if (isPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setDuration('Pausado');
      return;
    }

    if (isCompleted) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      // Calcular duração final quando completado
      const start = new Date(startTimestamp);
      const end = endTimestamp ? new Date(endTimestamp) : new Date();
      const diff = end.getTime() - start.getTime();
      
      // REGRA CRÍTICA: Sem timers negativos (dados inconsistentes)
      if (diff < 0) {
        console.error('❌ TIMER NEGATIVO DETECTADO:', {
          startTimestamp,
          endTimestamp,
          start: start.toISOString(),
          end: end.toISOString(),
          diff_seconds: Math.round(diff / 1000)
        });
        setDuration('ERRO'); // Mostrar erro visível para dados inconsistentes
        return;
      }
      
      // Calcular apenas se positivo - SEMPRE mostrar HH:MM:SS
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours.toString().padStart(2, '0')}h`);
      parts.push(`${minutes.toString().padStart(2, '0')}m`);
      parts.push(`${seconds.toString().padStart(2, '0')}s`);
      
      setDuration(parts.join(' '));
      return;
    }

    const start = new Date(startTimestamp);
    const updateDuration = () => {
      const now = new Date();
      const diff = now.getTime() - start.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours.toString().padStart(2, '0')}h`);
      parts.push(`${minutes.toString().padStart(2, '0')}m`);
      parts.push(`${seconds.toString().padStart(2, '0')}s`);
      
      setDuration(parts.join(' '));
    };

    updateDuration();
    timerRef.current = window.setInterval(updateDuration, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [startTimestamp, endTimestamp, isCompleted, isPaused]);

  const startTime = startTimestamp ? new Date(startTimestamp) : null;
  const endTime = endTimestamp ? new Date(endTimestamp) : null;

  return {
    isActive: !isCompleted && !isPaused && !!startTimestamp,
    duration,
    startTime,
    endTime
  };
}