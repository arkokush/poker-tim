import { create } from 'zustand'
import type { GameVariant, PlayMode } from '../engines/types'

interface UIState {
  selectedVariant: GameVariant | null
  selectedMode: PlayMode | null
  soundEnabled: boolean
  animationSpeed: number // 0.5, 1, 2, 4
  isPaused: boolean

  setVariant: (v: GameVariant) => void
  setMode: (m: PlayMode) => void
  toggleSound: () => void
  setAnimationSpeed: (s: number) => void
  togglePause: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedVariant: null,
  selectedMode: null,
  soundEnabled: true,
  animationSpeed: 1,
  isPaused: false,

  setVariant: (v) => set({ selectedVariant: v }),
  setMode: (m) => set({ selectedMode: m }),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
}))
