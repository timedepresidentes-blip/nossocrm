'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  side?: 'right' | 'left';
  className?: string;
}

export function ResizeHandle({ onResize, side = 'right', className }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const startDrag = useCallback((clientX: number) => {
    isDragging.current = true;
    lastX.current = clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Desativa pointer-events no body para evitar que iframes capturem o drag
    document.body.style.pointerEvents = 'none';
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX);
  }, [startDrag]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(side === 'right' ? delta : -delta);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
    };

    // Listeners no document para capturar eventos mesmo fora do elemento
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Garante limpeza se o componente desmontar durante drag
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
    };
  }, [onResize, side]);

  return (
    /*
     * Largura total de 12px para área de clique confortável.
     * A linha visual de 2px fica centralizada via flex.
     * cursor-col-resize em toda a área facilita a descoberta.
     */
    <div
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      title="Arrastar para redimensionar coluna"
      className={cn(
        'w-3 shrink-0 flex items-stretch justify-center cursor-col-resize select-none group z-10',
        className
      )}
    >
      {/* Linha visual — fina em repouso, mais grossa e colorida no hover/drag */}
      <div
        className={cn(
          'w-0.5 self-stretch rounded-full transition-all duration-150',
          'bg-slate-200 dark:bg-slate-700',
          'group-hover:w-1 group-hover:bg-primary-400 dark:group-hover:bg-primary-500',
          'group-active:w-1 group-active:bg-primary-500 dark:group-active:bg-primary-400',
        )}
      />
    </div>
  );
}
