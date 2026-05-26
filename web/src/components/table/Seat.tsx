import { memo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CardComponent } from '../ui/CardComponent'
import { ChipStack } from '../ui/ChipStack'
import { ActionLabel } from '../ui/ActionLabel'
import type { Player, PlayerAction } from '../../engines/types'

interface Props {
  player: Player
  isActive: boolean
  isWinner: boolean
  showCards: boolean
  position: 'top' | 'bottom'
  lastAction?: { action: PlayerAction } | null
}

function actionToLabel(a: PlayerAction): { text: string; color: 'purple' | 'green' | 'red' } {
  switch (a.type) {
    case 'fold': return { text: 'FOLD', color: 'red' }
    case 'check': return { text: 'CHECK', color: 'green' }
    case 'call': return { text: a.amount ? `CALL ${a.amount}` : 'CALL', color: 'green' }
    case 'bet': return { text: a.amount ? `BET ${a.amount}` : 'BET', color: 'purple' }
    case 'raise': return { text: a.amount ? `RAISE ${a.amount}` : 'RAISE', color: 'purple' }
  }
}

export const Seat = memo(function Seat({ player, isActive, isWinner, showCards, position, lastAction }: Props) {
  const [displayAction, setDisplayAction] = useState<{ text: string; color: 'purple' | 'green' | 'red' } | null>(null)

  useEffect(() => {
    if (lastAction) {
      const label = actionToLabel(lastAction.action)
      setDisplayAction(label)
      const timer = setTimeout(() => setDisplayAction(null), 1500)
      return () => clearTimeout(timer)
    } else {
      setDisplayAction(null)
    }
  }, [lastAction])

  const ringColor = player.folded
    ? 'border-text-tertiary/30'
    : isWinner
      ? 'border-accent-green shadow-[0_0_16px_var(--color-accent-green-glow)]'
      : isActive
        ? 'border-accent-purple shadow-[0_0_12px_var(--color-accent-purple-glow)]'
        : 'border-border-subtle'

  const dimmed = player.folded ? 'opacity-50' : ''

  return (
    <div className={`flex flex-col items-center gap-2 ${position === 'top' ? 'flex-col' : 'flex-col-reverse'} ${dimmed}`}>
      {/* Action label */}
      <ActionLabel action={displayAction?.text ?? null} color={displayAction?.color ?? 'green'} />

      {/* Cards */}
      <div className="flex gap-1">
        {player.holeCards.map((card, i) => (
          <CardComponent
            key={`${card.rank}${card.suit}-${i}`}
            card={card}
            faceUp={showCards}
            index={i}
            highlight={isWinner ? 'green' : null}
            size="md"
          />
        ))}
        {player.holeCards.length === 0 && !player.folded && (
          <div className="w-14 h-20 rounded-lg border border-border-subtle/30" />
        )}
      </div>

      {/* Avatar + Info */}
      <div className="flex flex-col items-center gap-1">
        <motion.div
          animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={isActive ? { duration: 1.5, repeat: Infinity } : {}}
          className={`w-14 h-14 rounded-full bg-bg-overlay border-2 flex items-center justify-center ${ringColor} transition-all`}
        >
          <span className="text-xl font-bold text-text-primary">
            {player.name.charAt(0).toUpperCase()}
          </span>
        </motion.div>

        <div className="text-center">
          <p className="text-text-primary text-sm font-medium leading-tight">{player.name}</p>
          <p className={`text-xs font-medium ${player.isBot ? 'text-text-tertiary' : 'text-accent-purple'}`}>
            {player.isBot ? player.botStrategy?.toUpperCase() ?? 'BOT' : 'PLAYER'}
          </p>
        </div>

        {/* Stack */}
        <p className="font-mono text-sm font-semibold text-text-primary tabular-nums">
          {player.stack}
        </p>
      </div>

      {/* Bet */}
      {player.currentBet > 0 && (
        <ChipStack
          amount={player.currentBet}
          color={isActive ? 'purple' : 'neutral'}
        />
      )}
    </div>
  )
})
