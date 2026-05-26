import { kuhnEngine } from './kuhn'
import { leducEngine } from './leduc'
import { limitHoldemEngine } from './limit_holdem'
import type { GameEngine, GameVariant } from './types'

export * from './types'

export function getEngine(variant: GameVariant): GameEngine {
  switch (variant) {
    case 'kuhn': return kuhnEngine
    case 'leduc': return leducEngine
    case 'limit_holdem': return limitHoldemEngine
  }
}
