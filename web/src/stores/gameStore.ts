import { create } from 'zustand'
import type { GameState, GameConfig, PlayerAction, PlayMode, Player } from '../engines/types'
import { getEngine } from '../engines'
import { getBot } from '../bots'

interface HandRecord {
  handNumber: number
  winner: number | null
  winAmount: number
  actions: GameState['actionHistory']
  players: { id: number; name: string; stack: number; holeCards: Player['holeCards'] }[]
  communityCards: GameState['communityCards']
}

interface GameSession {
  id: string
  config: GameConfig
  mode: PlayMode
  state: GameState | null
  handHistory: HandRecord[]
  isRunning: boolean
  bvbSpeed: number // 0.5, 1, 2, 4, or 0 for instant
  bvbInterval: ReturnType<typeof setTimeout> | null
}

interface GameStore {
  session: GameSession | null

  startSession: (config: GameConfig, mode: PlayMode, players: Pick<Player, 'id' | 'name' | 'isBot' | 'botStrategy'>[]) => void
  dealHand: () => void
  playerAction: (action: PlayerAction) => void
  botAct: () => Promise<void>
  endSession: () => void
  setBvbSpeed: (speed: number) => void
  stepOneAction: () => void
  stepOneHand: () => void
  toggleRunning: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  session: null,

  startSession: (config, mode, players) => {
    const engine = getEngine(config.variant)
    const state = engine.createInitialState(config, players)
    const id = crypto.randomUUID()
    set({
      session: {
        id,
        config,
        mode,
        state,
        handHistory: [],
        isRunning: false,
        bvbSpeed: 1,
        bvbInterval: null,
      },
    })
  },

  dealHand: () => {
    const { session } = get()
    if (!session || !session.state) return
    const engine = getEngine(session.config.variant)
    const newState = engine.dealNewHand(session.state)
    set({
      session: { ...session, state: newState },
    })
  },

  playerAction: (action) => {
    const { session } = get()
    if (!session || !session.state) return
    const engine = getEngine(session.config.variant)
    const newState = engine.applyAction(session.state, action)

    let handHistory = session.handHistory
    if (newState.isHandOver) {
      handHistory = [
        ...handHistory,
        {
          handNumber: newState.handNumber,
          winner: newState.winner,
          winAmount: newState.winAmount,
          actions: newState.actionHistory,
          players: newState.players.map((p) => ({
            id: p.id,
            name: p.name,
            stack: p.stack,
            holeCards: [...p.holeCards],
          })),
          communityCards: [...newState.communityCards],
        },
      ]
    }

    set({
      session: { ...session, state: newState, handHistory },
    })
  },

  botAct: async () => {
    const { session } = get()
    if (!session || !session.state || session.state.isHandOver) return

    const currentPlayer = session.state.players[session.state.currentPlayerIndex]
    if (!currentPlayer.isBot) return

    const bot = getBot(currentPlayer.botStrategy || 'random')
    const action = bot.decide(session.state)
    get().playerAction(action)
  },

  endSession: () => {
    const { session } = get()
    if (session?.bvbInterval) {
      clearInterval(session.bvbInterval)
    }
    set({ session: null })
  },

  setBvbSpeed: (speed) => {
    const { session } = get()
    if (!session) return
    set({ session: { ...session, bvbSpeed: speed } })
  },

  stepOneAction: () => {
    const { session } = get()
    if (!session || !session.state) return
    if (session.state.isHandOver) {
      get().dealHand()
    } else {
      get().botAct()
    }
  },

  stepOneHand: () => {
    const { session } = get()
    if (!session || !session.state) return
    const engine = getEngine(session.config.variant)

    let state = session.state
    if (state.isHandOver) {
      state = engine.dealNewHand(state)
    }

    while (!state.isHandOver) {
      const currentPlayer = state.players[state.currentPlayerIndex]
      if (currentPlayer.isBot) {
        const bot = getBot(currentPlayer.botStrategy || 'random')
        const action = bot.decide(state)
        state = engine.applyAction(state, action)
      } else {
        break
      }
    }

    const handHistory = state.isHandOver
      ? [
          ...session.handHistory,
          {
            handNumber: state.handNumber,
            winner: state.winner,
            winAmount: state.winAmount,
            actions: state.actionHistory,
            players: state.players.map((p) => ({
              id: p.id,
              name: p.name,
              stack: p.stack,
              holeCards: [...p.holeCards],
            })),
            communityCards: [...state.communityCards],
          },
        ]
      : session.handHistory

    set({ session: { ...session, state, handHistory } })
  },

  toggleRunning: () => {
    const { session } = get()
    if (!session) return
    set({ session: { ...session, isRunning: !session.isRunning } })
  },
}))
