import type { BotStrategy } from './types'
import type { Action, PlayerAction } from '../engines/types'

export const randomBot: BotStrategy = {
  name: 'Random',
  description: 'Picks uniformly at random from valid actions',

  decide(state): PlayerAction {
    const { validActions, currentBetSize, betToCall } = state
    const action: Action = validActions[Math.floor(Math.random() * validActions.length)]

    switch (action) {
      case 'fold':
        return { type: 'fold' }
      case 'check':
        return { type: 'check' }
      case 'call':
        return { type: 'call', amount: betToCall }
      case 'bet':
        return { type: 'bet', amount: currentBetSize }
      case 'raise':
        return { type: 'raise', amount: currentBetSize }
    }
  },
}
