/// <reference types="vite/client" />

interface Window {
  playerApi?: {
    getGpuDiagnostics?: () => Promise<Record<string, unknown>>
    getRuntimeInfo?: () => Promise<{
      isElectronPlayer: boolean
      gpuFeatureStatus?: Record<string, unknown>
      chromeVersion?: string
      bgaMode?: string
    }>
    setBgaLayerState?: (state: {
      videoId?: string | null
      visible: boolean
      opacity: number
      currentSeconds: number
      shouldPlay: boolean
    }) => void
    setBgaLayerBounds?: (bounds: {
      x: number
      y: number
      width: number
      height: number
    } | null) => void
    openDiagnostics?: () => void
    retryLoad?: () => void
    toggleFullscreen?: () => void
  }
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
