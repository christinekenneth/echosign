'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── MEDIAPIPE CDN TYPES ──────────────────────────────────────
// @mediapipe/hands exports window.Hands; holistic does not reliably
// expose window.Holistic in all CDN environments.
declare global {
  interface Window {
    Hands:  new (config: { locateFile: (file: string) => string }) => HandsInstance
    Camera: new (videoEl: HTMLVideoElement, config: CameraConfig)  => CameraInstance
  }
}

interface HandsInstance {
  setOptions(options: Record<string, unknown>): void
  onResults(callback: (results: HandsResults) => void): void
  send(input: { image: HTMLVideoElement }): Promise<void>
  close(): void
}

interface CameraInstance {
  start(): Promise<void>
  stop(): void
}

interface CameraConfig {
  onFrame: () => Promise<void>
  width: number
  height: number
}

interface Landmark { x: number; y: number; z: number }

// @mediapipe/hands result shape
interface HandsResults {
  multiHandLandmarks?: Landmark[][]
  // "Left"/"Right" are from the camera's perspective (mirror of user)
  multiHandedness?: Array<{ label: 'Left' | 'Right'; score: number }>
}

interface HandsData {
  dominantHand:       Landmark[]
  secondaryHand:      Landmark[] | null
  dominantHandedness: 'right' | 'left'
}

interface SignResult {
  recognised:         boolean
  sign?:              string
  handedness?:        string
  bothHands?:         boolean
  phrase?:            string
  translatedPhrase?:  string
  targetLanguage?:    string
  confidence:         number
  suggestions?:       Array<{ id: string; description: string }>
}

// ─── PROPS ────────────────────────────────────────────────────
interface SignCaptureProps {
  isRecording:     boolean
  targetLanguage:  string
  onSignDetected:  (phrase: string, confidence: number) => void
}

// ─── CDN ──────────────────────────────────────────────────────
const CDN        = 'https://cdn.jsdelivr.net/npm'
const HANDS_PKG  = '@mediapipe/hands@0.4.1646424915'
const CAMERA_PKG = '@mediapipe/camera_utils@0.3.1640029074'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload  = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

// ─── SKELETON CONNECTIONS ─────────────────────────────────────
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]

// ─── COMPONENT ────────────────────────────────────────────────
export default function SignCapture({ isRecording, targetLanguage, onSignDetected }: SignCaptureProps) {
  const videoRef          = useRef<HTMLVideoElement>(null)
  const canvasRef         = useRef<HTMLCanvasElement>(null)
  const handsInstanceRef  = useRef<HandsInstance | null>(null)
  const cameraRef         = useRef<CameraInstance | null>(null)
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const handsDataRef      = useRef<HandsData | null>(null)
  const isSendingRef      = useRef(false)
  const targetLangRef     = useRef(targetLanguage)
  const onSignDetectedRef = useRef(onSignDetected)

  const [status, setStatus]             = useState<'initializing' | 'ready' | 'error'>('initializing')
  const [result, setResult]             = useState<SignResult | null>(null)
  const [handsVisible, setHandsVisible] = useState(0)
  const [errorMsg, setErrorMsg]         = useState('')

  useEffect(() => { targetLangRef.current = targetLanguage }, [targetLanguage])
  useEffect(() => { onSignDetectedRef.current = onSignDetected }, [onSignDetected])

  // ─── CANVAS HELPERS ───────────────────────────────────────────
  // Resizing the canvas element clears its bitmap, so clearCanvas doubles
  // as a reset before drawing multiple hands per frame.
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
  }, [])

  const drawHand = useCallback((lms: Landmark[], lineColor: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror matches the selfie-flipped video element.
    ctx.save()
    ctx.scale(-1, 1)
    ctx.translate(-canvas.width, 0)

    ctx.strokeStyle = lineColor
    ctx.lineWidth   = 2
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo(lms[a].x * canvas.width, lms[a].y * canvas.height)
      ctx.lineTo(lms[b].x * canvas.width, lms[b].y * canvas.height)
      ctx.stroke()
    }

    ctx.fillStyle = '#ffffff'
    for (const lm of lms) {
      ctx.beginPath()
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }, [])

  // ─── INIT MEDIAPIPE HANDS ─────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        await loadScript(`${CDN}/${HANDS_PKG}/hands.js`)
        await loadScript(`${CDN}/${CAMERA_PKG}/camera_utils.js`)
        if (!mounted) return

        const hands = new window.Hands({
          locateFile: (file: string) => `${CDN}/${HANDS_PKG}/${file}`,
        })

        hands.setOptions({
          maxNumHands:             2,
          modelComplexity:         1,
          minDetectionConfidence:  0.5,
          minTrackingConfidence:   0.5,
        })

        hands.onResults((results: HandsResults) => {
          const allLandmarks  = results.multiHandLandmarks  ?? []
          const allHandedness = results.multiHandedness     ?? []

          clearCanvas()

          if (allLandmarks.length === 0) {
            handsDataRef.current = null
            setHandsVisible(0)
            return
          }

          // MediaPipe labels are mirrored: "Left" label = user's right hand.
          let rightIdx = -1   // index of user's right hand in allLandmarks
          let leftIdx  = -1   // index of user's left hand
          allHandedness.forEach((h, i) => {
            if (h.label === 'Left')  rightIdx = i
            if (h.label === 'Right') leftIdx  = i
          })

          // Prefer the user's right hand as dominant; fall back to whatever is present.
          const domIdx           = rightIdx >= 0 ? rightIdx : 0
          const secIdx           = rightIdx >= 0 ? leftIdx  : -1
          const dominantHandedness: 'right' | 'left' = rightIdx >= 0 ? 'right' : 'left'

          const dominantHand  = allLandmarks[domIdx]
          const secondaryHand = secIdx >= 0 ? allLandmarks[secIdx] : null

          handsDataRef.current = { dominantHand, secondaryHand, dominantHandedness }
          setHandsVisible(allLandmarks.length)

          // Dominant hand: full teal. Secondary hand: dimmed teal.
          drawHand(dominantHand, '#00D4AA')
          if (secondaryHand) drawHand(secondaryHand, '#00D4AA55')
        })

        handsInstanceRef.current = hands

        const video = videoRef.current
        if (!video || !mounted) return

        const camera = new window.Camera(video, {
          onFrame: async () => {
            if (handsInstanceRef.current && video.readyState >= 2) {
              await handsInstanceRef.current.send({ image: video })
            }
          },
          width:  640,
          height: 480,
        })

        cameraRef.current = camera
        await camera.start()
        if (mounted) setStatus('ready')
      } catch (err) {
        if (mounted) {
          setStatus('error')
          setErrorMsg(err instanceof Error ? err.message : 'Camera initialisation failed')
        }
      }
    }

    init()

    return () => {
      mounted = false
      cameraRef.current?.stop()
      handsInstanceRef.current?.close()
    }
  }, [drawHand, clearCanvas])

  // ─── SEND INTERVAL ────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }

    intervalRef.current = setInterval(async () => {
      const hands = handsDataRef.current
      if (!hands || isSendingRef.current) return

      isSendingRef.current = true
      try {
        const res = await fetch('/api/sign-to-text', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dominantHand:       hands.dominantHand,
            secondaryHand:      hands.secondaryHand,
            dominantHandedness: hands.dominantHandedness,
            targetLanguage:     targetLangRef.current,
          }),
        })
        const json = await res.json()
        if (json.status === 'success') {
          setResult(json.data)
          if (json.data.recognised && json.data.translatedPhrase) {
            onSignDetectedRef.current(json.data.translatedPhrase, json.data.confidence)
          }
        }
      } catch {
        // network error — skip this tick
      } finally {
        isSendingRef.current = false
      }
    }, 500)

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    }
  }, [isRecording])

  // ─── DERIVED UI VALUES ────────────────────────────────────────
  const confPct   = result ? Math.min(result.confidence, 100) : 0
  const confColor = confPct >= 70 ? '#00D4AA' : confPct >= 50 ? '#F5A623' : '#E8445A'

  const handLabel =
    handsVisible === 2 ? '2 hands ✓' :
    handsVisible === 1 ? '1 hand ✓'  : 'No hands'

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Camera preview + skeleton overlay */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ background: '#0A1628', aspectRatio: '4/3' }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />

        {/* Top-left status badge */}
        <div className="absolute top-3 left-3">
          {status === 'initializing' && (
            <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white">
              Loading camera…
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/80 text-white">
              {errorMsg || 'Camera error'}
            </span>
          )}
          {status === 'ready' && isRecording && (
            <span
              className="text-xs px-2 py-1 rounded-full text-white font-medium"
              style={{ background: '#00D4AA' }}
            >
              ● Recording
            </span>
          )}
          {status === 'ready' && !isRecording && (
            <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white">
              Ready
            </span>
          )}
        </div>

        {/* Top-right hand count */}
        {status === 'ready' && (
          <div className="absolute top-3 right-3">
            <span
              className="text-xs px-2 py-1 rounded-full text-white"
              style={{
                background: handsVisible > 0 ? '#00D4AA22' : '#ffffff11',
                border:     `1px solid ${handsVisible > 0 ? '#00D4AA' : '#ffffff33'}`,
              }}
            >
              {handLabel}
            </span>
          </div>
        )}
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: '#0A1628' }}>
          <span>Confidence</span>
          <span style={{ color: result ? confColor : '#9CA3AF' }}>
            {result ? `${confPct}%` : '—'}
          </span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: '#E5E7EB' }}>
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: `${confPct}%`, background: confColor }}
          />
        </div>
      </div>

      {/* Result panel */}
      {result && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#F7F8FC', border: '1px solid #E5E7EB' }}
        >
          {result.recognised ? (
            <>
              <p className="text-base font-semibold" style={{ color: '#0A1628' }}>
                {result.translatedPhrase || result.phrase}
              </p>
              {result.translatedPhrase && result.targetLanguage && result.targetLanguage !== 'en' && (
                <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                  {result.phrase}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-medium" style={{ color: '#00D4AA' }}>
                  {result.sign?.replace(/_/g, ' ')}
                </span>
                {result.handedness && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#0A162811', color: '#6B7280' }}
                  >
                    {result.bothHands ? 'both hands' : `${result.handedness} hand`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: '#6B7280' }}>
                Sign not recognised — try one of these:
              </p>
              <ul className="space-y-1">
                {result.suggestions?.map((s) => (
                  <li key={s.id} className="text-xs" style={{ color: '#0A1628' }}>
                    <span className="font-medium">{s.id.replace(/_/g, ' ')}</span>
                    {' — '}
                    {s.description}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
