/**
 * appStore.ts
 * Zustand global state — tabs, threads, AI selection, theme
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState, Tab, Thread, DatasetProfile, AIEngine } from '@/types'
import { AMAZON_PROFILE } from '@/lib/csvProcessor'

const DEFAULT_TAB: Tab = {
  id: 'default',
  name: 'Amazon Sales',
  threads: [],
  dataset: AMAZON_PROFILE,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tabs: [DEFAULT_TAB],
      activeTabId: 'default',
      activeAI: 'gemini',
      isLoading: false,
      thinkStep: 0,
      theme: 'dark',

      setTheme: (theme) => set({ theme }),
      setActiveAI: (activeAI) => set({ activeAI }),
      setLoading: (isLoading) => set({ isLoading }),
      setThinkStep: (thinkStep) => set({ thinkStep }),

      addTab: (tab) => set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),

      closeTab: (id) => set(s => {
        const tabs = s.tabs.filter(t => t.id !== id)
        if (!tabs.length) {
          return { tabs: [{ ...DEFAULT_TAB, threads: [] }], activeTabId: 'default' }
        }
        const activeTabId = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId
        return { tabs, activeTabId }
      }),

      switchTab: (activeTabId) => set({ activeTabId }),

      addThread: (tabId, thread) => set(s => ({
        tabs: s.tabs.map(t =>
          t.id === tabId ? { ...t, threads: [thread, ...t.threads] } : t
        )
      })),

      clearThreads: (tabId) => set(s => ({
        tabs: s.tabs.map(t =>
          t.id === tabId ? { ...t, threads: [] } : t
        )
      })),

      setDataset: (tabId, dataset) => set(s => ({
        tabs: s.tabs.map(t =>
          t.id === tabId ? { ...t, dataset } : t
        )
      })),

      updateTabName: (tabId, name) => set(s => ({
        tabs: s.tabs.map(t =>
          t.id === tabId ? { ...t, name } : t
        )
      })),
    }),
    {
      name: 'flow-app-state',
      partialize: (s) => ({ theme: s.theme, activeAI: s.activeAI }),
    }
  )
)

// Selector helpers
export const useActiveTab = () => {
  const { tabs, activeTabId } = useAppStore()
  return tabs.find(t => t.id === activeTabId) ?? tabs[0]
}

export const useActiveDataset = (): DatasetProfile => {
  const tab = useActiveTab()
  return tab?.dataset ?? AMAZON_PROFILE
}
