import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  action: string | null
  color: 'purple' | 'green' | 'red'
}

const colorClasses = {
  purple: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
  green: 'bg-accent-green/20 text-accent-green border-accent-green/30',
  red: 'bg-accent-red/20 text-accent-red border-accent-red/30',
}

export function ActionLabel({ action, color }: Props) {
  return (
    <AnimatePresence>
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${colorClasses[color]}`}
        >
          {action}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
