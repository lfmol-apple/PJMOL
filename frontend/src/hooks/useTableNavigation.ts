import { useEffect, useCallback } from 'react';

export function useKeyboardNavigation(
  onPrevPage: () => void,
  onNextPage: () => void,
  enabled: boolean = true
) {
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    // Alt + Left Arrow = Página anterior
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      onPrevPage();
    }
    // Alt + Right Arrow = Próxima página
    else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      onNextPage();
    }
  }, [onPrevPage, onNextPage, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);
}

export function useTableSize() {
  const setCompactMode = useCallback((compact: boolean) => {
    if (compact) {
      document.body.classList.add('compact-table');
    } else {
      document.body.classList.remove('compact-table');
    }
    localStorage.setItem('tableCompactMode', String(compact));
  }, []);

  useEffect(() => {
    const savedMode = localStorage.getItem('tableCompactMode');
    if (savedMode === 'true') {
      setCompactMode(true);
    }
  }, [setCompactMode]);

  return { setCompactMode };
}