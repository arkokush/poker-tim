import { create } from 'zustand'
import type { GameVariant, PlayMode } from '../engines/types'

document.documentElement.classList.add('light')

interface UIState {
  selectedVariant: GameVariant | null
  selectedMode: PlayMode | null
  soundEnabled: boolean
  animationSpeed: number
  isPaused: boolean
  lightMode: boolean
  pvpWaitingForPass: boolean
  pvpActivePlayer: number // which player index should see their cards

  setVariant: (v: GameVariant) => void
  setMode: (m: PlayMode) => void
  toggleSound: () => void
  setAnimationSpeed: (s: number) => void
  togglePause: () => void
  toggleLightMode: () => void
  setPvpWaitingForPass: (waiting: boolean) => void
  setPvpActivePlayer: (index: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedVariant: null,
  selectedMode: null,
  soundEnabled: true,
  animationSpeed: 1,
  isPaused: false,
  lightMode: true,
  pvpWaitingForPass: false,
  pvpActivePlayer: 0,

  setVariant: (v) => set({ selectedVariant: v }),
  setMode: (m) => set({ selectedMode: m }),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
  toggleLightMode: () =>
    set((s) => {
      const next = !s.lightMode
      document.documentElement.classList.toggle('light', next)
      return { lightMode: next }
    }),
  setPvpWaitingForPass: (waiting) => set({ pvpWaitingForPass: waiting }),
  setPvpActivePlayer: (index) => set({ pvpActivePlayer: index }),
}))
