/**
 * @fileoverview UI State Store (Zustand)
 *
 * Estado de UI global que não pertence a nenhum domínio de negócio.
 * sidebarCollapsed é persistido no localStorage para manter a preferência do operador.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isGlobalAIOpen: boolean;
  setIsGlobalAIOpen: (isOpen: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  activeBoardId: string;
  setActiveBoardId: (id: string) => void;
}

export const useUIState = create<UIState>()(
  persist(
    (set) => ({
      isGlobalAIOpen: false,
      setIsGlobalAIOpen: (isOpen) => set({ isGlobalAIOpen: isOpen }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      activeBoardId: '',
      setActiveBoardId: (id) => set({ activeBoardId: id }),
    }),
    {
      name: 'nossocrm-ui',
      // Persiste apenas a preferência do sidebar; estado volátil (AI aberto) não é persistido
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      // skipHydration evita mismatch SSR/CSR no Next.js; reidratar manualmente no Layout
      skipHydration: true,
    }
  )
);
