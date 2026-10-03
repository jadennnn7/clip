'use client'

import * as React from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Schwebende Pillen-Navigation. Fällt beim Laden mit einer Feder von oben
 * ein und bleibt dann stehen — alle Einträge immer sichtbar.
 */
export function AnimatedNav({
  children,
  className,
  label = 'Hauptnavigation',
}: {
  children: React.ReactNode
  className?: string
  label?: string
}) {
  return (
    <motion.nav
      aria-label={label}
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className={cn('flex items-center rounded-full', className)}
    >
      {children}
    </motion.nav>
  )
}
