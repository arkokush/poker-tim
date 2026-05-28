import type { Card, Rank, Suit, GameConfig, GameEngine, GameState, Player, PlayerAction, Action, Street } from './types'

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

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS: Suit[] = ['h', 'd', 'c', 's']

function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

const RANK_VALUE: Record<string, number> = {}
RANKS.forEach((r, i) => { RANK_VALUE[r] = i })

// ---------- Hand evaluation ----------

const HandRank = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const

type HandRankValue = (typeof HandRank)[keyof typeof HandRank]

interface HandScore {
  rank: HandRankValue
  tiebreakers: number[] // descending importance
}

function compareScores(a: HandScore, b: HandScore): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0
    const bv = b.tiebreakers[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

function evaluateBest5(cards: Card[]): HandScore {
  // Generate all C(7,5) = 21 combinations
  let best: HandScore | null = null
  const n = cards.length
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const hand = [cards[i], cards[j], cards[k], cards[l], cards[m]]
            const score = evaluate5(hand)
            if (best === null || compareScores(score, best) > 0) {
              best = score
            }
          }
        }
      }
    }
  }
  return best!
}

function evaluate5(cards: Card[]): HandScore {
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])

  // Check straight
  let isStraight = false
  let straightHigh = 0
  // Normal straight
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true
    straightHigh = values[0]
  }
  // Wheel: A-2-3-4-5 (A=12, 5=3, 4=2, 3=1, 2=0)
  if (!isStraight) {
    const sorted = [...values].sort((a, b) => a - b)
    if (sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 && sorted[3] === 3 && sorted[4] === 12) {
      isStraight = true
      straightHigh = 3 // 5-high straight
    }
  }

  // Count ranks
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  if (isStraight && isFlush) {
    return { rank: HandRank.StraightFlush, tiebreakers: [straightHigh] }
  }

  if (groups[0][1] === 4) {
    return { rank: HandRank.FourOfAKind, tiebreakers: [groups[0][0], groups[1][0]] }
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { rank: HandRank.FullHouse, tiebreakers: [groups[0][0], groups[1][0]] }
  }

  if (isFlush) {
    return { rank: HandRank.Flush, tiebreakers: values }
  }

  if (isStraight) {
    return { rank: HandRank.Straight, tiebreakers: [straightHigh] }
  }

  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a)
    return { rank: HandRank.ThreeOfAKind, tiebreakers: [groups[0][0], ...kickers] }
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a)
    const kicker = groups[2][0]
    return { rank: HandRank.TwoPair, tiebreakers: [...pairs, kicker] }
  }

  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a)
    return { rank: HandRank.Pair, tiebreakers: [groups[0][0], ...kickers] }
  }

  return { rank: HandRank.HighCard, tiebreakers: values }
}

// ---------- Engine state ----------

interface HoldemExtra {
  deck: Card[]
  betsThisRound: number
  smallBlind: number
  bigBlind: number
}

const extraState = new Map<number, HoldemExtra>()
let globalRng: () => number = Math.random
let configSmallBlind = 1
let configBigBlind = 2

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river']

function nextStreet(s: Street): Street | null {
  const idx = STREET_ORDER.indexOf(s)
  return idx < STREET_ORDER.length - 1 ? STREET_ORDER[idx + 1] : null
}

function betSizeForStreet(street: Street, bigBlind: number): number {
  if (street === 'preflop' || street === 'flop') return bigBlind
  return bigBlind * 2
}

export const limitHoldemEngine: GameEngine = {
  createInitialState(config: GameConfig, players: Pick<Player, 'id' | 'name' | 'isBot' | 'botStrategy'>[]): GameState {
    if (config.seed !== undefined) {
      globalRng = mulberry32(config.seed)
    } else {
      globalRng = mulberry32(Date.now())
    }
    configSmallBlind = config.smallBlind
    configBigBlind = config.bigBlind

    const gamePlayers: Player[] = players.map(p => ({
      ...p,
      stack: config.startingStack,
      holeCards: [],
      folded: false,
      currentBet: 0,
    }))

    return {
      variant: 'limit_holdem',
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
      currentBetSize: config.bigBlind,
    }
  },

  dealNewHand(state: GameState): GameState {
    const deck = shuffle(buildDeck(), globalRng)
    const smallBlind = configSmallBlind
    const bigBlind = configBigBlind
    const extra: HoldemExtra = {
      deck,
      betsThisRound: 0,
      smallBlind,
      bigBlind,
    }

    const handNumber = state.handNumber + 1
    extraState.set(handNumber, extra)

    // For heads-up: dealer/SB rotates each hand
    const dealerIdx = 1 - state.dealerIndex
    const sbIdx = dealerIdx
    const bbIdx = 1 - dealerIdx

    const players = state.players.map((p, i) => {
      const newP = { ...p, holeCards: [deck[i * 2], deck[i * 2 + 1]], folded: false, currentBet: 0 }
      if (i === sbIdx) {
        newP.currentBet = smallBlind
        newP.stack = p.stack - smallBlind
      } else if (i === bbIdx) {
        newP.currentBet = bigBlind
        newP.stack = p.stack - bigBlind
      }
      return newP
    })

    extra.betsThisRound = 1 // BB counts as first bet

    const newState: GameState = {
      ...state,
      players,
      communityCards: [],
      pot: smallBlind + bigBlind,
      currentPlayerIndex: sbIdx, // SB acts first preflop in heads-up
      street: 'preflop',
      isHandOver: false,
      winner: null,
      winAmount: 0,
      handNumber,
      actionHistory: [],
      betToCall: bigBlind - smallBlind,
      currentBetSize: bigBlind,
      dealerIndex: dealerIdx,
      validActions: getActionsForState(bigBlind - smallBlind, 1),
    }

    return newState
  },

  applyAction(state: GameState, action: PlayerAction): GameState {
    const extra = extraState.get(state.handNumber)!
    const newState: GameState = {
      ...state,
      players: state.players.map(p => ({ ...p, holeCards: [...p.holeCards] })),
      communityCards: [...state.communityCards],
      actionHistory: [...state.actionHistory, { playerIndex: state.currentPlayerIndex, action, street: state.street }],
    }

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
      // Check if this completes the round
      const roundActions = newState.actionHistory.filter(a => a.street === newState.street)
      // Preflop: BB checks after SB calls (special case)
      // Postflop: second check ends the round
      if (newState.street === 'preflop') {
        // BB checking after SB limped in
        if (roundActions.length >= 2) {
          return advanceStreet(newState, extra)
        }
      } else {
        if (roundActions.length >= 2) {
          return advanceStreet(newState, extra)
        }
      }
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex
      newState.validActions = getActionsForState(0, extra.betsThisRound)
      return newState
    }

    if (action.type === 'call') {
      const callAmount = newState.betToCall
      currentPlayer.stack -= callAmount
      currentPlayer.currentBet += callAmount
      newState.pot += callAmount
      newState.betToCall = 0

      // Calling ends the betting round (unless it's the preflop SB completing)
      // After a call, check if we should give BB option
      if (newState.street === 'preflop' && extra.betsThisRound === 1) {
        // SB just called (limped), BB gets option to check or raise
        newState.currentPlayerIndex = 1 - newState.currentPlayerIndex
        newState.betToCall = 0
        newState.validActions = getActionsForState(0, extra.betsThisRound)
        return newState
      }

      return advanceStreet(newState, extra)
    }

    if (action.type === 'bet') {
      const betAmt = betSizeForStreet(newState.street, extra.bigBlind)
      currentPlayer.stack -= betAmt
      currentPlayer.currentBet += betAmt
      newState.pot += betAmt
      newState.betToCall = betAmt
      extra.betsThisRound = 1
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex
      newState.validActions = getActionsForState(betAmt, extra.betsThisRound)
      return newState
    }

    if (action.type === 'raise') {
      const raiseSize = betSizeForStreet(newState.street, extra.bigBlind)
      const totalCost = newState.betToCall + raiseSize
      currentPlayer.stack -= totalCost
      currentPlayer.currentBet += totalCost
      newState.pot += totalCost
      newState.betToCall = raiseSize
      extra.betsThisRound++
      newState.currentPlayerIndex = 1 - newState.currentPlayerIndex
      newState.validActions = getActionsForState(raiseSize, extra.betsThisRound)
      return newState
    }

    return newState
  },

  getValidActions(state: GameState): { actions: Action[]; betSize: number; callAmount: number } {
    const extra = extraState.get(state.handNumber)
    const betSize = extra ? betSizeForStreet(state.street, extra.bigBlind) : state.currentBetSize
    return {
      actions: state.validActions,
      betSize,
      callAmount: state.betToCall,
    }
  },
}

function getActionsForState(betToCall: number, betsThisRound: number): Action[] {
  if (betToCall === 0) {
    // No bet to call: can check or bet
    return ['check', 'bet']
  }
  // Facing a bet/raise
  const actions: Action[] = ['fold', 'call']
  if (betsThisRound < 4) {
    actions.push('raise')
  }
  return actions
}

function advanceStreet(state: GameState, extra: HoldemExtra): GameState {
  // Reset bets
  state.players.forEach(p => { p.currentBet = 0 })
  extra.betsThisRound = 0
  state.betToCall = 0

  const next = nextStreet(state.street)
  if (next === null) {
    return resolveShowdown(state, extra)
  }

  state.street = next
  state.currentBetSize = betSizeForStreet(next, extra.bigBlind)

  // Deal community cards
  const deckStart = 4 // first 4 cards are hole cards
  if (next === 'flop') {
    state.communityCards = [extra.deck[deckStart], extra.deck[deckStart + 1], extra.deck[deckStart + 2]]
  } else if (next === 'turn') {
    state.communityCards = [...state.communityCards, extra.deck[deckStart + 3]]
  } else if (next === 'river') {
    state.communityCards = [...state.communityCards, extra.deck[deckStart + 4]]
  }

  // Post-flop: non-dealer acts first (BB = index 1 - dealerIndex)
  state.currentPlayerIndex = 1 - state.dealerIndex
  state.validActions = ['check', 'bet']
  return state
}

function resolveShowdown(state: GameState, _extra: HoldemExtra): GameState {
  const p0 = state.players[0]
  const p1 = state.players[1]

  state.isHandOver = true
  state.validActions = []

  if (p0.folded) {
    state.winner = p1.id
    state.winAmount = state.pot
    p1.stack += state.pot
    state.pot = 0
    return state
  }
  if (p1.folded) {
    state.winner = p0.id
    state.winAmount = state.pot
    p0.stack += state.pot
    state.pot = 0
    return state
  }

  const cards0 = [...p0.holeCards, ...state.communityCards]
  const cards1 = [...p1.holeCards, ...state.communityCards]
  const score0 = evaluateBest5(cards0)
  const score1 = evaluateBest5(cards1)
  const cmp = compareScores(score0, score1)

  if (cmp > 0) {
    state.winner = p0.id
    state.winAmount = state.pot
    p0.stack += state.pot
  } else if (cmp < 0) {
    state.winner = p1.id
    state.winAmount = state.pot
    p1.stack += state.pot
  } else {
    // Split pot
    state.winner = null
    state.winAmount = state.pot
    const half = state.pot / 2
    p0.stack += half
    p1.stack += half
  }
  state.pot = 0
  return state
}
