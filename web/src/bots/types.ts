import type { GameState, PlayerAction } from '../engines/types'

export interface BotStrategy {
  name: string
  description: string
  decide(state: GameState): PlayerAction
}
