import { motion } from 'framer-motion'
import type { Card } from '../../engines/types'

interface Props {
  card?: Card
  faceUp?: boolean
  index?: number
  highlight?: 'green' | 'purple' | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: { w: 44, h: 62, text: 'text-sm', suit: 'text-xs' },
  md: { w: 56, h: 80, text: 'text-lg', suit: 'text-sm' },
  lg: { w: 72, h: 100, text: 'text-2xl', suit: 'text-base' },
}

const suitSymbol: Record<string, string> = {
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  s: '\u2660',
}

const suitColor: Record<string, string> = {
  h: '#EF4444',
  d: '#EF4444',
  c: '#F4F4F8',
  s: '#F4F4F8',
}

export function CardComponent({ card, faceUp = true, index = 0, highlight, size = 'md' }: Props) {
  const s = sizeMap[size]

  const glowClass = highlight === 'green'
    ? 'shadow-[0_0_16px_var(--color-accent-green-glow)]'
    : highlight === 'purple'
      ? 'shadow-[0_0_16px_var(--color-accent-purple-glow)]'
      : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -60, rotateY: faceUp ? 180 : 0 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{
        delay: index * 0.08,
        duration: 0.38,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ width: s.w, height: s.h, perspective: 800 }}
      className="relative"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ delay: index * 0.08 + 0.38, duration: 0.12 }}
        className={`w-full h-full rounded-lg overflow-hidden ${glowClass}`}
      >
        {faceUp && card ? (
          <div className="w-full h-full bg-white rounded-lg flex flex-col items-center justify-center border border-gray-200 relative">
            <span className={`font-mono font-bold ${s.text} leading-none`} style={{ color: suitColor[card.suit] }}>
              {card.rank}
            </span>
            <span className={`${s.suit} leading-none mt-0.5`} style={{ color: suitColor[card.suit] }}>
              {suitSymbol[card.suit]}
            </span>
          </div>
        ) : (
          <div
            className="w-full h-full rounded-lg border border-border-subtle"
            style={{
              background: 'linear-gradient(135deg, #4338CA 0%, #6D28D9 50%, #7C3AED 100%)',
              backgroundImage: `
                linear-gradient(135deg, #4338CA 0%, #6D28D9 50%, #7C3AED 100%),
                repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 5px)
              `,
            }}
          />
        )}
      </motion.div>
    </motion.div>
  )
}
