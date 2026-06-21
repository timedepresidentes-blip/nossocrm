'use client';

import React, { useEffect, useRef } from 'react';
import { Zap, Settings } from 'lucide-react';
import Link from 'next/link';
import type { QuickReply } from '@/lib/query/hooks/useQuickRepliesQuery';

interface QuickRepliesMenuProps {
  items: QuickReply[];
  activeIndex: number;
  onSelect: (reply: QuickReply) => void;
  onClose: () => void;
  onConfigure?: () => void;
}

export function QuickRepliesMenu({ items, activeIndex, onSelect, onClose, onConfigure }: QuickRepliesMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Mantém o item ativo visível ao navegar com teclado
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Respostas rápidas</span>
        <span className="ml-auto text-xs text-slate-400">↑↓ navegar · Enter selecionar · Esc fechar</span>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">Nenhuma resposta rápida cadastrada</div>
      ) : (
        <ul ref={listRef} className="max-h-52 overflow-y-auto py-1">
          {items.map((reply, i) => (
            <li key={reply.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown para não perder o foco do textarea
                  e.preventDefault();
                  onSelect(reply);
                }}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                  i === activeIndex
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">/</span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      /{reply.shortcut}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {reply.title}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 mt-0.5">
                    {reply.content}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onConfigure !== undefined && (
        <div className="border-t border-slate-100 dark:border-white/5 px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">Digite / para filtrar</span>
          <Link
            href="/settings#quick-replies"
            onMouseDown={(e) => { e.preventDefault(); onConfigure(); }}
            className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 transition-colors"
          >
            <Settings className="w-3 h-3" />
            Configurar
          </Link>
        </div>
      )}
    </div>
  );
}
