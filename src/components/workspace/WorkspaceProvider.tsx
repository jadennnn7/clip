'use client'

import { useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import { LOCAL_WORKSPACE_OWNER, useWorkspaceStore } from '@/stores/workspace-store'
import { usePipelineSync } from '@/lib/link-import'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const error = useWorkspaceStore((state) => state.persistenceError)
  usePipelineSync()
  useEffect(() => {
    if (error) toast.error(error, { id: 'workspace-storage', duration: 12000 })
  }, [error])
  return children
}

/**
 * Lädt den Workspace des angemeldeten Kontos. Die App-Layouts kennen das
 * Konto vom Server und setzen es hier ein; Landingpage und Anmeldung laden
 * gar keinen Workspace. `null` ist der Demo-Modus ohne Anmeldung.
 */
export function WorkspaceOwner({ userId }: { userId: string | null }) {
  const hydrate = useWorkspaceStore((state) => state.hydrate)
  useEffect(() => { hydrate(userId ?? LOCAL_WORKSPACE_OWNER) }, [hydrate, userId])
  return null
}
