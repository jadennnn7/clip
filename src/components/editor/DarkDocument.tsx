'use client'

import { useEffect } from 'react'

/**
 * Hält das ganze Dokument dunkel, solange der Editor offen ist.
 *
 * Das Editor-Layout setzt `.dark` auf seinen Container. Menüs, Popover und
 * Tooltips werden aber in `<body>` portiert — außerhalb dieses Containers.
 * Bei hellem Systemthema erschienen sie hell mitten im dunklen Schnittfenster.
 * Deshalb bekommt für die Dauer des Editors auch `<html>` die Klasse; beim
 * Verlassen gilt wieder das gewählte Thema.
 */
export function DarkDocument() {
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const previousScheme = root.style.colorScheme
    const apply = () => {
      if (!root.classList.contains('dark')) root.classList.add('dark')
      if (root.style.colorScheme !== 'dark') root.style.colorScheme = 'dark'
    }
    apply()
    // next-themes schreibt die Klasse bei einem Themenwechsel neu.
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => {
      observer.disconnect()
      if (!hadDark) root.classList.remove('dark')
      root.style.colorScheme = previousScheme
    }
  }, [])
  return null
}
