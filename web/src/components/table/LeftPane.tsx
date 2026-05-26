import { User, Bot, TrendingUp, TrendingDown } from 'lucide-react'
import type { Player } from '../../engines/types'

interface HandRecord {
  winner: number | null
  winAmount: number
}

interface Props {
  players: Player[]
  handHistory: HandRecord[]
}

export function LeftPane({ players, handHistory }: Props) {
  const getWinRate = (playerId: number) => {
    if (handHistory.length === 0) return 0
    const wins = handHistory.filter((h) => h.winner === playerId).length
    return Math.round((wins / handHistory.length) * 100)
  }

  const getProfit = (playerId: number) => {
    return handHistory.reduce((sum, h) => {
      if (h.winner === playerId) return sum + h.winAmount
      return sum
    }, 0)
  }

  return (
    <div className="w-[280px] flex flex-col gap-3 p-4 overflow-y-auto border-r border-border-subtle">
      <p className="text-text-tertiary text-xs uppercase tracking-[0.18em] font-medium">Players</p>

      {players.map((player) => {
        const winRate = getWinRate(player.id)
        const profit = getProfit(player.id)
        const isPositive = profit >= 0

        return (
          <div
            key={player.id}
            className="p-4 rounded-xl bg-bg-elevated border border-border-subtle"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-bg-overlay border border-border-subtle flex items-center justify-center">
                {player.isBot ? (
                  <Bot className="w-4 h-4 text-text-tertiary" />
                ) : (
                  <User className="w-4 h-4 text-accent-purple" />
                )}
              </div>
              <div>
                <p className="text-text-primary text-sm font-medium">{player.name}</p>
                <span className={`text-xs uppercase tracking-[0.18em] font-medium ${player.isBot ? 'text-text-tertiary' : 'text-accent-purple'}`}>
                  {player.isBot ? player.botStrategy ?? 'BOT' : 'PLAYER'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-text-tertiary text-xs mb-0.5">Win Rate</p>
                <p className={`font-mono text-sm font-semibold ${winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {winRate}%
                </p>
              </div>
              <div>
                <p className="text-text-tertiary text-xs mb-0.5">Profit</p>
                <p className={`font-mono text-sm font-semibold flex items-center gap-1 ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isPositive ? '+' : ''}{profit}
                </p>
              </div>
              <div>
                <p className="text-text-tertiary text-xs mb-0.5">Stack</p>
                <p className="font-mono text-sm font-semibold text-text-primary tabular-nums">{player.stack}</p>
              </div>
              <div>
                <p className="text-text-tertiary text-xs mb-0.5">Hands</p>
                <p className="font-mono text-sm font-semibold text-text-primary">{handHistory.length}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
