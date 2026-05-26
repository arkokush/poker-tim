import { randomBot } from './random'
import { alwaysCallBot } from './always_call'
import { aggressiveBot } from './aggressive'
import { tightBot } from './tight'
import type { BotStrategy } from './types'

export type { BotStrategy } from './types'

export const botStrategies: Record<string, BotStrategy> = {
  random: randomBot,
  always_call: alwaysCallBot,
  aggressive: aggressiveBot,
  tight: tightBot,
}

export function getBot(name: string): BotStrategy {
  return botStrategies[name] ?? randomBot
}
