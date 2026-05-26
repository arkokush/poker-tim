import type { BotStrategy } from './types'
import type { GameState, PlayerAction, Action, Card } from '../engines/types'

// Strategy tables loaded from pre-trained JSON files
let kuhnStrategy: Record<string, { actions: string[]; probs: number[] }> | null = null
let leducStrategy: Record<string, { actions: string[]; probs: number[] }> | null = null
let limitStrategy: Record<string, { actions: string[]; probs: number[] }> | null = null
let preflopEquity: Record<string, number> | null = null

let loadPromise: Promise<void> | null = null

// Rank values for the hand evaluator
const RANK_VALUES: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
  '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12,
}

const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

function loadStrategies(): Promise<void> {
  if (loadPromise) return loadPromise
  const base = import.meta.env.BASE_URL
  loadPromise = Promise.all([
    fetch(`${base}models/kuhn_strategy.json`).then((r) => r.json()).then((d) => { kuhnStrategy = d }),
    fetch(`${base}models/leduc_strategy.json`).then((r) => r.json()).then((d) => { leducStrategy = d }),
    fetch(`${base}models/limit_strategy.json`).then((r) => r.json()).then((d) => { limitStrategy = d }),
    fetch(`${base}models/preflop_equity.json`).then((r) => r.json()).then((d) => { preflopEquity = d }),
  ]).then(() => {})
  return loadPromise
}

// Eagerly start loading
loadStrategies()

// ---- Info set key builders ----

function leducInfoKey(state: GameState): string {
  const me = state.players[state.currentPlayerIndex]
  const holeCard = me.holeCards[0].rank // J, Q, or K
  const history = buildActionHistory(state, 'leduc')

  if (state.communityCards.length > 0) {
    const communityCard = state.communityCards[0].rank
    return `${holeCard}|${communityCard}:${history}`
  }
  return `${holeCard}:${history}`
}

function limitInfoKey(state: GameState): string {
  const me = state.players[state.currentPlayerIndex]
  const bucket = computeEquityBucket(me.holeCards, state.communityCards, state.street)
  const history = buildActionHistory(state, 'limit_holdem')
  return `b${bucket}:${history}`
}

// Map web engine actions to Python training action labels
function actionToLabel(actionType: string): string {
  switch (actionType) {
    case 'check': return 'P'  // Pass
    case 'fold': return 'F'
    case 'call': return 'C'
    case 'bet': return 'B'
    case 'raise': return 'R'
    default: return 'P'
  }
}

// Map Python training action labels back to web engine actions
function labelToAction(label: string, state: GameState): PlayerAction {
  const { betToCall, currentBetSize } = state
  switch (label) {
    case 'F': return { type: 'fold' }
    case 'C': return { type: 'call', amount: betToCall }
    case 'R': return { type: 'raise', amount: currentBetSize }
    case 'B': return { type: 'bet', amount: currentBetSize }
    case 'P': return { type: 'check' }
    default: return { type: 'check' }
  }
}

function buildActionHistory(state: GameState, variant: string): string {
  let result = ''
  let currentStreet = 'preflop'

  for (const entry of state.actionHistory) {
    // Add round separator when street changes (Leduc and Limit)
    if (variant !== 'kuhn' && entry.street !== currentStreet) {
      result += '//'
      currentStreet = entry.street
    }
    result += actionToLabel(entry.action.type)
  }

  return result
}

// Kuhn: P maps to check OR fold depending on context, B maps to bet OR call
// In the Kuhn training: P=pass(check/fold), B=bet(bet/call)
// First action: P=check, B=bet. After bet: P=fold, B=call.
function kuhnActionToLabel(actionType: string): string {
  switch (actionType) {
    case 'check': return 'P'
    case 'fold': return 'P'   // In Kuhn, fold = pass after bet
    case 'bet': return 'B'
    case 'call': return 'B'   // In Kuhn, call = bet after bet
    default: return 'P'
  }
}

function kuhnLabelToAction(label: string, state: GameState): PlayerAction {
  const { betToCall } = state
  // If there's a bet to call, P=fold, B=call
  // If no bet to call, P=check, B=bet
  if (betToCall > 0) {
    return label === 'B'
      ? { type: 'call', amount: betToCall }
      : { type: 'fold' }
  }
  return label === 'B'
    ? { type: 'bet', amount: state.currentBetSize }
    : { type: 'check' }
}

function buildKuhnActionHistory(state: GameState): string {
  let result = ''
  for (const entry of state.actionHistory) {
    result += kuhnActionToLabel(entry.action.type)
  }
  return result
}

// ---- Equity computation for Limit Hold'em ----

function preflopKey(card0: Card, card1: Card): string {
  const r0 = RANK_VALUES[card0.rank]
  const r1 = RANK_VALUES[card1.rank]
  const high = Math.max(r0, r1)
  const low = Math.min(r0, r1)
  const highLabel = RANK_LABELS[high]
  const lowLabel = RANK_LABELS[low]

  if (high === low) {
    return `${highLabel}${lowLabel}`  // Pair: "AA", "KK"
  }
  const suited = card0.suit === card1.suit ? 's' : 'o'
  return `${highLabel}${lowLabel}${suited}`  // "AKs", "AKo"
}

function equityBucket(winProb: number, nBuckets: number = 8): number {
  return Math.min(Math.floor(winProb * nBuckets), nBuckets - 1)
}

// Simple hand strength estimation for post-flop
// Uses a rough heuristic based on hand evaluation
function computeEquityBucket(holeCards: Card[], communityCards: Card[], street: string): number {
  if (street === 'preflop' || communityCards.length === 0) {
    if (!preflopEquity || holeCards.length < 2) return 4 // middle bucket fallback
    const key = preflopKey(holeCards[0], holeCards[1])
    const equity = preflopEquity[key] ?? 0.5
    return equityBucket(equity)
  }

  // Post-flop: simple hand strength estimation
  // Score the hand and normalize to a probability-like value
  const allCards = [...holeCards, ...communityCards]
  const score = simpleHandStrength(allCards)
  // Normalize score to [0, 1] range — max possible is ~8000 (straight flush), typical high card is ~100
  const normalized = Math.min(score / 5000, 1.0)
  return equityBucket(normalized)
}

// Simple hand strength scorer (returns a numeric score)
function simpleHandStrength(cards: Card[]): number {
  const ranks = cards.map((c) => RANK_VALUES[c.rank])
  const suits = cards.map((c) => c.suit)

  // Count ranks
  const rankCounts: Record<number, number> = {}
  for (const r of ranks) {
    rankCounts[r] = (rankCounts[r] || 0) + 1
  }

  // Count suits
  const suitCounts: Record<string, number> = {}
  for (const s of suits) {
    suitCounts[s] = (suitCounts[s] || 0) + 1
  }

  const counts = Object.values(rankCounts).sort((a, b) => b - a)
  const hasFlush = Object.values(suitCounts).some((c) => c >= 5)
  const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a)

  // Check for straight
  let hasStraight = false
  let straightHigh = 0
  const sortedUnique = [...new Set(ranks)].sort((a, b) => b - a)
  // Add low ace
  if (sortedUnique.includes(12)) sortedUnique.push(-1)
  for (let i = 0; i <= sortedUnique.length - 5; i++) {
    if (sortedUnique[i] - sortedUnique[i + 4] === 4) {
      hasStraight = true
      straightHigh = sortedUnique[i]
      break
    }
  }

  const highCard = uniqueRanks[0]

  // Score: hand rank * 1000 + kicker value
  if (hasStraight && hasFlush) return 8000 + straightHigh
  if (counts[0] === 4) return 7000 + highCard
  if (counts[0] === 3 && counts[1] >= 2) return 6000 + highCard
  if (hasFlush) return 5000 + highCard
  if (hasStraight) return 4000 + straightHigh
  if (counts[0] === 3) return 3000 + highCard
  if (counts[0] === 2 && counts[1] === 2) return 2000 + highCard
  if (counts[0] === 2) return 1000 + highCard
  return highCard
}

// ---- Sample from strategy distribution ----

function sampleAction(probs: number[], actions: string[]): string {
  const roll = Math.random()
  let cumulative = 0
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i]
    if (roll < cumulative) return actions[i]
  }
  return actions[actions.length - 1]
}

// ---- Fallback to random ----

function randomFallback(state: GameState): PlayerAction {
  const { validActions, currentBetSize, betToCall } = state
  const action: Action = validActions[Math.floor(Math.random() * validActions.length)]
  switch (action) {
    case 'fold': return { type: 'fold' }
    case 'check': return { type: 'check' }
    case 'call': return { type: 'call', amount: betToCall }
    case 'bet': return { type: 'bet', amount: currentBetSize }
    case 'raise': return { type: 'raise', amount: currentBetSize }
  }
}

// ---- The bot ----

export const mccfrBot: BotStrategy = {
  name: 'MCCFR',
  description: 'Uses pre-trained Monte Carlo CFR strategies',

  decide(state: GameState): PlayerAction {
    const { variant } = state

    if (variant === 'kuhn') {
      if (!kuhnStrategy) return randomFallback(state)
      const key = `${state.players[state.currentPlayerIndex].holeCards[0].rank}:${buildKuhnActionHistory(state)}`
      const entry = kuhnStrategy[key]
      if (!entry) return randomFallback(state)
      const label = sampleAction(entry.probs, entry.actions)
      return kuhnLabelToAction(label, state)
    }

    if (variant === 'leduc') {
      if (!leducStrategy) return randomFallback(state)
      const key = leducInfoKey(state)
      const entry = leducStrategy[key]
      if (!entry) return randomFallback(state)
      const label = sampleAction(entry.probs, entry.actions)
      return labelToAction(label, state)
    }

    if (variant === 'limit_holdem') {
      if (!limitStrategy) return randomFallback(state)
      const key = limitInfoKey(state)
      const entry = limitStrategy[key]
      if (!entry) return randomFallback(state)
      const label = sampleAction(entry.probs, entry.actions)
      return labelToAction(label, state)
    }

    return randomFallback(state)
  },
}
