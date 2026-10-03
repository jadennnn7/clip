'use client'

import { EditorShell } from '@/components/editor/EditorShell'
import { MOCK_VIDEO_SRC, mockClips, mockProject, mockWaveform } from '@/lib/mock-data'

/**
 * Der Editor mit dem Beispielprojekt. Das Projekt liegt in keinem Workspace,
 * Änderungen bleiben also in diesem Tab und werden nirgends gespeichert.
 */
export default function DemoPage() {
  return (
    <EditorShell
      project={mockProject}
      videoSrc={MOCK_VIDEO_SRC}
      waveform={mockWaveform}
      initialClips={mockClips}
      anonymous
    />
  )
}
