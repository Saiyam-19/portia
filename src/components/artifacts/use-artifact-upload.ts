'use client'

import { useRef, useState } from 'react'
import { useUploadThing } from '@/lib/artifacts/upload'
import { MAX_TURN_ATTACHMENTS, uploadError, type ArtifactRef } from '@/lib/artifacts/shared'

export function useArtifactUpload() {
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const inFlight = useRef(false)
  const { startUpload, isUploading } = useUploadThing('artifactUploader', {
    onUploadProgress: setProgress,
    onUploadError: error => setError(error.message || 'Upload failed. Try again.'),
  })
  const upload = async (files: File[], artifactId?: string): Promise<ArtifactRef[]> => {
    if (inFlight.current) return []
    setError(''); setProgress(0)
    if (!files.length) return []
    const invalid = files.length > MAX_TURN_ATTACHMENTS ? `Upload at most ${MAX_TURN_ATTACHMENTS} files at once.` : files.map(uploadError).find(Boolean)
    if (invalid) { setError(invalid); return [] }
    inFlight.current = true
    try {
      const results = await startUpload(files, artifactId ? { artifactId } : {})
      const saved = results?.map(result => result.serverData) ?? []
      const failed = saved.find(file => file.status !== 'ready')
      if (failed) setError(failed.error ?? 'Uploaded, but the text view is not ready. Retry from Artifacts.')
      return saved.filter(file => file.status === 'ready').map(({ id, name, mimeType, size, revision }) => ({ id, name, mimeType, size, revision }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed. Try again.')
      return []
    } finally { inFlight.current = false }
  }
  return { upload, busy: isUploading, progress, error, setError }
}
