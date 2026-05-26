import type { BotStrategy } from './types'
import type { PlayerAction } from '../engines/types'

export const tightBot: BotStrategy = {
  name: 'Tight-Passive',
  description: 'Folds 50% when facing a bet, calls the other 50%. Bets/raises only 15% when it can check.',

  decide(state): PlayerAction {
    const { validActions, currentBetSize, betToCall } = state
    const roll = Math.random()

    const canRaise = validActions.includes('raise')
    const canBet = validActions.includes('bet')
    const facingBet = validActions.includes('call')

    // Facing a bet (must call or fold, may be able to raise)
    if (facingBet) {
      if (roll < 0.50) {
        return { type: 'fold' }
      }
      return { type: 'call', amount: betToCall }
    }

    // Not facing a bet — can check or bet/raise
    if (canBet || canRaise) {
      if (roll < 0.15) {
        const type = canBet ? 'bet' : 'raise'
        return { type, amount: currentBetSize }
      }
      return { type: 'check' }
    }

    return { type: 'check' }
  },
}
