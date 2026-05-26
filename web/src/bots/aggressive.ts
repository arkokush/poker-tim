import type { BotStrategy } from './types'
import type { PlayerAction } from '../engines/types'

export const aggressiveBot: BotStrategy = {
  name: 'Aggressive',
  description: 'Raises/bets 70% of the time, calls 25%, folds 5% (only when facing a bet).',

  decide(state): PlayerAction {
    const { validActions, currentBetSize, betToCall } = state
    const roll = Math.random()

    const canRaise = validActions.includes('raise')
    const canBet = validActions.includes('bet')
    const canCheck = validActions.includes('check')
    const facingBet = validActions.includes('call')

    // When we can raise or bet
    if (canRaise || canBet) {
      if (roll < 0.70) {
        const type = canRaise ? 'raise' : 'bet'
        return { type, amount: currentBetSize }
      }
      if (roll < 0.95) {
        // Call or check
        if (facingBet) {
          return { type: 'call', amount: betToCall }
        }
        return { type: 'check' }
      }
      // 5% fold — but never fold if we can check
      if (facingBet) {
        return { type: 'fold' }
      }
      return { type: 'check' }
    }

    // No raise/bet available — call or check, never fold if can check
    if (canCheck) {
      return { type: 'check' }
    }
    if (facingBet) {
      // Without raise available: call 95%, fold 5%
      if (roll < 0.95) {
        return { type: 'call', amount: betToCall }
      }
      return { type: 'fold' }
    }

    // Fallback
    return { type: 'check' }
  },
}
