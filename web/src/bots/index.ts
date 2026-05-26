import { randomBot } from './random'
import { alwaysCallBot } from './always_call'
import { mccfrBot } from './mccfr'
import type { BotStrategy } from './types'

export type { BotStrategy } from './types'

export const botStrategies: Record<string, BotStrategy> = {
  random: randomBot,
  always_call: alwaysCallBot,
  mccfr: mccfrBot,
}

export function getBot(name: string): BotStrategy {
  return botStrategies[name] ?? randomBot
}
