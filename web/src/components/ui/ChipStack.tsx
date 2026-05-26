import { motion } from 'framer-motion'

interface Props {
  amount: number
  color?: 'purple' | 'green' | 'red' | 'neutral'
  animate?: boolean
  flyTo?: { x: number; y: number }
}

const colorMap = {
  purple: '#8B5CF6',
  green: '#22C55E',
  red: '#EF4444',
  neutral: '#A1A1B5',
}

function chipCount(amount: number): number {
  return Math.min(Math.max(Math.ceil(amount / 5), 1), 4)
}

export function ChipStack({ amount, color = 'neutral', animate = true, flyTo }: Props) {
  if (amount <= 0) return null

  const chips = chipCount(amount)
  const chipColor = colorMap[color]

  return (
    <motion.div
      className="flex flex-col-reverse items-center relative"
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={
        flyTo
          ? { x: flyTo.x, y: flyTo.y, scale: 1, opacity: 1 }
          : { scale: 1, opacity: 1 }
      }
      transition={{
        duration: flyTo ? 0.48 : 0.25,
        ease: flyTo ? [0.22, 1, 0.36, 1] : 'easeOut',
      }}
    >
      {Array.from({ length: chips }).map((_, i) => (
        <div
          key={i}
          className="rounded-full border-2"
          style={{
            width: 24,
            height: 8,
            marginBottom: i === 0 ? 0 : -3,
            backgroundColor: chipColor,
            borderColor: `color-mix(in srgb, ${chipColor} 70%, black)`,
            boxShadow: `0 1px 2px rgba(0,0,0,0.3)`,
          }}
        />
      ))}
      <span className="font-mono text-xs text-text-primary mt-1 font-medium">
        {amount}
      </span>
    </motion.div>
  )
}
