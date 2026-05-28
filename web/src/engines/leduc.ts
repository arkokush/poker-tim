import type { Card, GameConfig, GameEngine, GameState, Player, PlayerAction, Action } from './types'

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const LEDUC_DECK: Card[] = [
  { rank: 'J', suit: 'h' },
  { rank: 'J', suit: 's' },
  { rank: 'Q', suit: 'h' },
  { rank: 'Q', suit: 's' },
  { rank: 'K', suit: 'h' },
  { rank: 'K', suit: 's' },
]

const RANK_VALUE: Record<string, number> = { J: 0, Q: 1, K: 2 }

// Track raises per round internally
interface LeducExtra {
  raisesThisRound: number
  deck: Card[]
}

const extraState = new Map<number, LeducExtra>()

let globalRng: () => number = Math.random

export const leducEngine: GameEngine = {
  createInitialState(config: GameConfig, players: Pick<Player, 'id' | 'name' | 'isBot' | 'botStrategy'>[]): GameState {
    if (config.seed !== undefined) {
      globalRng = mulberry32(config.seed)
    } else {
      globalRng = mulberry32(Date.now())
    }

    const gamePlayers: Player[] = players.map(p => ({
      ...p,
      stack: config.startingStack,
      holeCards: [],
      folded: false,
      currentBet: 0,
    }))

    return {
      variant: 'leduc',
      players: gamePlayers,
      communityCards: [],
      pot: 0,
      currentPlayerIndex: 0,
      street: 'preflop',
      dealerIndex: 0,
      isHandOver: false,
      winner: null,
      winAmount: 0,
      handNumber: 0,
      actionHistory: [],
      validActions: [],
      betToCall: 0,
      currentBetSize: 2,
      smallBlind: 1,
      bigBlind: 2,
    }
  },

  dealNewHand(state: GameState): GameState {
    const deck = shuffle(LEDUC_DECK, globalRng)
    const players = state.players.map((p, i) => ({
      ...p,
      holeCards: [deck[i]],
      folded: false,
      currentBet: 1, // ante
      stack: p.stack - 1,
    }))

    const handNumber = state.handNumber + 1

    extraState.set(handNumber, {
      raisesThisRound: 0,
      deck, // community card will be deck[2]
    })

    const newState: GameState = {
      ...state,
      players,
      communityCards: [],
      pot: 2,
      currentPlayerIndex: 0,
      street: 'preflop', // round 1 (before community card)
      isHandOver: false,
      winner: null,
      winAmount: 0,
      handNumber,
      actionHistory: [],
      betToCall: 0,
      currentBetSize: 2,
      validActions: ['check', 'bet'],
      dealerIndex: 1 - state.dealerIndex,
    }

    return newState
  },

  applyAction(state: GameState, action: PlayerAction): GameState {
    const newState: GameState = {
      ...state,
      players: state.players.map(p => ({ ...p, holeCards: [...p.holeCards] })),
      communityCards: [...state.communityCards],
      actionHistory: [...state.actionHistory, { playerIndex: state.currentPlayerIndex, action, street: state.street }],
    }

    const extra = extraState.get(newState.handNumber)!
    const currentPlayer = newState.players[newState.currentPlayerIndex]
    const opponent = newState.players[1 - newState.currentPlayerIndex]

    if (action.type === 'fold') {
      currentPlayer.folded = true
      newState.isHandOver = true
      newState.winner = opponent.id
      newState.winAmount = newState.pot
      opponent.stack += newState.pot
      newState.pot = 0
      newState.validActions = []
      return newState
    }

    if (action.type === 'check') {
      const roundActions = newState.actionHistory.filter(a => a.street === newState.street)
      // Both players checked
      if (roundActions.length >= 2 && roundActions[roundActions.length - 1].action.type === 'check' && roundActions[roundActions.length - 2].action.type === 'check') {
        return advanceStreet(newState, extra)
      }
      // First check, move to opponent
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex
      newState.validActions = ['check', 'bet']
      return newState
    }

    if (action.type === 'bet') {
      const betSize = newState.currentBetSize
      currentPlayer.stack -= betSize
      currentPlayer.currentBet += betSize
      newState.pot += betSize
      newState.betToCall = betSize
      extra.raisesThisRound = 1
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex

      // After a bet, opponent can fold, call, or raise (if raises < 2)
      const actions: Action[] = ['fold', 'call']
      if (extra.raisesThisRound < 2) {
        actions.push('raise')
      }
      newState.validActions = actions
      return newState
    }

    if (action.type === 'raise') {
      const raiseSize = newState.currentBetSize
      const totalToCall = newState.betToCall
      const totalCost = totalToCall + raiseSize
      currentPlayer.stack -= totalCost
      currentPlayer.currentBet += totalCost
      newState.pot += totalCost
      newState.betToCall = raiseSize
      extra.raisesThisRound++
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex

      const actions: Action[] = ['fold', 'call']
      if (extra.raisesThisRound < 2) {
        actions.push('raise')
      }
      newState.validActions = actions
      return newState
    }

    if (action.type === 'call') {
      const callAmount = newState.betToCall
      currentPlayer.stack -= callAmount
      currentPlayer.currentBet += callAmount
      newState.pot += callAmount
      newState.betToCall = 0
      return advanceStreet(newState, extra)
    }

    return newState
  },

  getValidActions(state: GameState): { actions: Action[]; betSize: number; callAmount: number } {
    return {
      actions: state.validActions,
      betSize: state.currentBetSize,
      callAmount: state.betToCall,
    }
  },
}

function advanceStreet(state: GameState, extra: LeducExtra): GameState {
  // Reset current bets
  state.players.forEach(p => { p.currentBet = 0 })
  extra.raisesThisRound = 0

  if (state.street === 'preflop') {
    // Deal community card and move to round 2
    state.communityCards = [extra.deck[2]]
    state.street = 'flop' // round 2
    state.currentBetSize = 4
    state.currentPlayerIndex = 0
    state.betToCall = 0
    state.validActions = ['check', 'bet']
    return state
  }

  // After round 2, go to showdown
  return resolveShowdown(state)
}

function resolveShowdown(state: GameState): GameState {
  const p0 = state.players[0]
  const p1 = state.players[1]
  const community = state.communityCards[0]

  const p0Pair = p0.holeCards[0].rank === community.rank
  const p1Pair = p1.holeCards[0].rank === community.rank
  const v0 = RANK_VALUE[p0.holeCards[0].rank]
  const v1 = RANK_VALUE[p1.holeCards[0].rank]

  state.isHandOver = true
  state.validActions = []

  let winnerIdx: number
  if (p0Pair && !p1Pair) {
    winnerIdx = 0
  } else if (p1Pair && !p0Pair) {
    winnerIdx = 1
  } else if (p0Pair && p1Pair) {
    // Both pair (same rank since only 1 community card) - shouldn't happen with 6-card deck
    // but handle: higher pair wins
    winnerIdx = v0 > v1 ? 0 : 1
  } else {
    // No pairs, higher card wins
    winnerIdx = v0 > v1 ? 0 : 1
  }

  state.winner = state.players[winnerIdx].id
  state.winAmount = state.pot
  state.players[winnerIdx].stack += state.pot
  state.pot = 0
  return state
}
