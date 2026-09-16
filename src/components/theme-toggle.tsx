'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Umschalter hell/dunkel.
 *
 * Bewusst ohne Zustandsabfrage beim Rendern: `resolvedTheme` ist im ersten
 * Render auf dem Server unbekannt. Stattdessen liegen beide Symbole
 * übereinander und werden per CSS-Klasse ein- und ausgeblendet — so gibt es
 * keinen Hydration-Mismatch und kein Aufblitzen des falschen Symbols.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Farbschema umschalten"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
