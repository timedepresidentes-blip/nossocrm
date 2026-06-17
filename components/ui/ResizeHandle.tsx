'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  /** Callback chamado com o delta de pixels a aplicar na coluna que expande */
  onResize: (delta: number) => void;
  /** 'right' = handle está na borda direita do painel esquerdo (padrão)
   *  'left'  = handle está na borda esquerda do painel direito (delta invertido) */
  side?: 'right' | 'left';
  className?: string;
}

export function ResizeHandle({ onResize, side = 'right', className }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Impede que iframes capturem o evento durante o drag
    document.body.style.pointerEvents = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      // Para handle na direita: delta positivo = arrastar para direita = painel cresce
      // Para handle na esquerda: delta positivo = arrastar para direita = painel diminui (invertido)
      onResize(side === 'right' ? delta : -delta);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize, side]);

  return (
    <div
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      title="Arrastar para redimensionar"
      className={cn(
        'w-1.5 shrink-0 cursor-col-resize relative group z-10 select-none',
        'hover:bg-primary-400/20 active:bg-primary-500/30',
        'transition-colors duration-150',
        className
      )}
    >
      {/* Linha visual no centro */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={cn(
          'w-px rounded-full',
          'bg-[var(--color-border-subtle)]',
          'group-hover:bg-primary-400 group-active:bg-primary-500',
          'h-8 group-hover:h-16 group-active:h-20',
          'transition-all duration-150'
        )} />
      </div>
      {/* Área de hit ampliada para facilitar o clique */}
      <div className="absolute -inset-x-1 inset-y-0" />
    </div>
  );
}
