import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'secondary'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
        variant === 'secondary'
          ? 'border-transparent bg-secondary text-secondary-foreground'
          : 'border-transparent bg-primary text-primary-foreground',
        className,
      )}
      {...props}
    />
  )
}
