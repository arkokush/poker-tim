import type { BotStrategy } from './types'
import type { PlayerAction } from '../engines/types'

export const alwaysCallBot: BotStrategy = {
  name: 'Always Call',
  description: 'Never folds, never raises. Calls if there is a bet, checks otherwise.',

  decide(state): PlayerAction {
    const { validActions, betToCall } = state

    if (validActions.includes('call')) {
      return { type: 'call', amount: betToCall }
    }

    return { type: 'check' }
  },
}
