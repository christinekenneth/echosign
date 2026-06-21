'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── TYPES ────────────────────────────────────────────────────
interface Landmark { x: number; y: number; z: number }

interface PredictResult {
  recognised:        boolean
  sign?:             string
  label?:            string
  phrase?:           string
  translatedPhrase?: string
  source?:           string
  confidence:        number
  handUsed?:         'one' | 'two' | 'sequence'
  message?:          string
}

interface SignCaptureProps {
  isRecording:        boolean
  targetLanguage:     string
  onSignDetected:     (phrase: string, confidence: number) => void
  onHandsDetected?:   (count: number) => void
  onPoseResults?:     (results: any) => void   // full Holistic result every frame
  compact?:           boolean
}

// ─── SEQUENCE HELPERS ────────────────────────────────────────
const SEQ_LEN   = 30
const MIN_FRAMES = 15   // start predicting once we have this many frames

function resampleTo30(frames: number[][]): number[] {
  const n   = frames.length
  const out: number[] = []
  for (let i = 0; i < SEQ_LEN; i++) {
    const src = n <= 1 ? 0 : Math.round((i / (SEQ_LEN - 1)) * (n - 1))
    out.push(...frames[Math.min(src, n - 1)])
  }
  return out
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

const HOLISTIC_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic'

// ─── COMPONENT ────────────────────────────────────────────────
export default function SignCapture({
  isRecording,
  targetLanguage,
  onSignDetected,
  onHandsDetected,
  onPoseResults,
  compact,
}: SignCaptureProps) {
  const videoRef           = useRef<HTMLVideoElement>(null)
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const holisticRef        = useRef<any>(null)
  const streamRef          = useRef<MediaStream | null>(null)
  const rafRef             = useRef<number | null>(null)
  const processingRef      = useRef(false)
  const isSendingRef       = useRef(false)
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const targetLangRef      = useRef(targetLanguage)
  const onSignDetectedRef  = useRef(onSignDetected)
  const onHandsDetectedRef = useRef(onHandsDetected)
  const onPoseResultsRef   = useRef(onPoseResults)

  // 30-frame rolling buffer: array of 126-float frames
  const frameBufferRef    = useRef<number[][]>([])

  // Phrase assembly
  const assembledTextRef  = useRef('')
  const lastAddedSignRef  = useRef('')
  const lastAppendTimeRef = useRef(0)
  const noHandTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status,        setStatus]        = useState<'initializing' | 'ready' | 'error'>('initializing')
  const [result,        setResult]        = useState<PredictResult | null>(null)
  const [handsVisible,  setHandsVisible]  = useState(0)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [assembledText, setAssembledText] = useState('')
  const [captionHint,   setCaptionHint]   = useState<'idle' | 'listening' | 'not_recognised'>('idle')
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { targetLangRef.current        = targetLanguage  }, [targetLanguage])
  useEffect(() => { onSignDetectedRef.current     = onSignDetected  }, [onSignDetected])
  useEffect(() => { onHandsDetectedRef.current    = onHandsDetected }, [onHandsDetected])
  useEffect(() => { onPoseResultsRef.current      = onPoseResults   }, [onPoseResults])

  // ─── SPACE TIMER ──────────────────────────────────────────────
  const scheduleSpaceIfNeeded = useCallback(() => {
    if (lastAddedSignRef.current === '' || noHandTimerRef.current) return
    noHandTimerRef.current = setTimeout(() => {
      if (assembledTextRef.current && !assembledTextRef.current.endsWith(' ')) {
        assembledTextRef.current += ' '
        setAssembledText(assembledTextRef.current)
      }
      lastAddedSignRef.current = ''
      noHandTimerRef.current   = null
    }, 1000)
  }, [])

  const clearSpaceTimer = useCallback(() => {
    if (noHandTimerRef.current) {
      clearTimeout(noHandTimerRef.current)
      noHandTimerRef.current = null
    }
  }, [])

  // ─── CANVAS DRAW ──────────────────────────────────────────────
  const drawHand = useCallback((lms: Landmark[], color: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.scale(-1, 1)
    ctx.translate(-canvas.width, 0)
    ctx.strokeStyle = color
    ctx.lineWidth   = 2
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo(lms[a].x * canvas.width, lms[a].y * canvas.height)
      ctx.lineTo(lms[b].x * canvas.width, lms[b].y * canvas.height)
      ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    for (const lm of lms) {
      ctx.beginPath()
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }, [])

  // ─── INIT ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        // Camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        await new Promise<void>(res => { video.onloadedmetadata = () => res() })
        await video.play()

        // MediaPipe Holistic (dynamic import for SSR safety)
        const mediapipe = await import('@mediapipe/holistic')
        if (!mounted) return

        const holistic = new mediapipe.Holistic({
          locateFile: (file: string) => `${HOLISTIC_CDN}/${file}`,
        })
        holistic.setOptions({
          modelComplexity:        1,
          smoothLandmarks:        true,
          enableSegmentation:     false,
          refineFaceLandmarks:    false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
        })

        let _scDbgFrame = 0
        holistic.onResults((results: any) => {
          if (++_scDbgFrame % 90 === 0) {
            console.log('[SignCapture] Pose landmarks:', results.poseLandmarks?.length)
          }
          // Always fire so AvatarMirror gets every frame (face + pose + hands)
          onPoseResultsRef.current?.(results)

          // Sync canvas dimensions only when they change (resetting clears context state)
          const canvas = canvasRef.current
          const vid    = videoRef.current
          if (canvas && vid) {
            const w = vid.videoWidth  || 640
            const h = vid.videoHeight || 480
            if (canvas.width !== w)  canvas.width  = w
            if (canvas.height !== h) canvas.height = h
          }
          const ctx = canvas?.getContext('2d')
          if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)

          // Count visible hands
          const leftLMs  = results.leftHandLandmarks  ?? null
          const rightLMs = results.rightHandLandmarks ?? null
          const count    = (leftLMs ? 1 : 0) + (rightLMs ? 1 : 0)
          setHandsVisible(count)
          onHandsDetectedRef.current?.(count)

          // Build 126-float frame and push into rolling buffer (max SEQ_LEN frames)
          const left63  = leftLMs
            ? (leftLMs  as Landmark[]).flatMap(lm => [lm.x, lm.y, lm.z])
            : new Array(63).fill(0)
          const right63 = rightLMs
            ? (rightLMs as Landmark[]).flatMap(lm => [lm.x, lm.y, lm.z])
            : new Array(63).fill(0)
          const frameBuf = frameBufferRef.current
          frameBuf.push([...left63, ...right63])
          if (frameBuf.length > SEQ_LEN) frameBufferRef.current = frameBuf.slice(-SEQ_LEN)

          if (!leftLMs && !rightLMs) {
            scheduleSpaceIfNeeded()
            return
          }

          // Draw overlays
          if (leftLMs)  drawHand(leftLMs,  '#00D4AA')
          if (rightLMs) drawHand(rightLMs, '#00D4AA88')

          clearSpaceTimer()
        })

        holisticRef.current = holistic

        // RAF loop — send each frame to Holistic
        const processFrame = async () => {
          if (!mounted) return
          if (holisticRef.current && video.readyState >= 2 && !processingRef.current) {
            processingRef.current = true
            try {
              await holisticRef.current.send({ image: video })
            } catch { /* skip frame */ }
            finally { processingRef.current = false }
          }
          if (mounted) rafRef.current = requestAnimationFrame(processFrame)
        }
        rafRef.current = requestAnimationFrame(processFrame)

        if (mounted) setStatus('ready')
      } catch (err) {
        if (mounted) {
          setStatus('error')
          setErrorMsg(err instanceof Error ? err.message : 'Camera init failed')
        }
      }
    }

    init()

    return () => {
      mounted = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      holisticRef.current?.close()
    }
  }, [drawHand, scheduleSpaceIfNeeded, clearSpaceTimer])

  // ─── SIGN DETECTION INTERVAL ──────────────────────────────────
  useEffect(() => {
    if (!isRecording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null }
      setCaptionHint('idle')
      clearSpaceTimer()
      return
    }
    setCaptionHint('listening')

    // Clear the frame buffer so idle frames from before recording don't contaminate
    // the first prediction (zero-heavy input maps everything to account_forgot_password).
    frameBufferRef.current    = []
    assembledTextRef.current  = ''
    lastAddedSignRef.current  = ''
    lastAppendTimeRef.current = 0
    setAssembledText('')
    setResult(null)

    intervalRef.current = setInterval(async () => {
      const frames  = frameBufferRef.current.slice()
      const hasSeq  = frames.length >= MIN_FRAMES

      if (!hasSeq) { scheduleSpaceIfNeeded(); return }
      if (isSendingRef.current) return
      isSendingRef.current = true

      try {
        const body = {
          frameSequence:  resampleTo30(frames),
          targetLanguage: targetLangRef.current,
        }

        const res  = await fetch('/api/sign-to-text/predict', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        const json = await res.json()

        if (json.status === 'success') {
          setResult(json.data)
          if (json.data.recognised && json.data.phrase) {
            clearSpaceTimer()
            setCaptionHint('listening')
            const phrase    = (json.data.translatedPhrase || json.data.phrase) as string
            const isSeqMode = hasSeq && json.data.source === 'ml_sequence'
            const now       = Date.now()

            if (isSeqMode) {
              if (phrase !== lastAddedSignRef.current && now - lastAppendTimeRef.current >= 1200) {
                assembledTextRef.current  = phrase
                setAssembledText(phrase)
                lastAddedSignRef.current  = phrase
                lastAppendTimeRef.current = now
                onSignDetectedRef.current(phrase, json.data.confidence)
              }
            } else {
              if (phrase !== lastAddedSignRef.current && now - lastAppendTimeRef.current >= 800) {
                assembledTextRef.current += phrase
                setAssembledText(assembledTextRef.current)
                lastAddedSignRef.current  = phrase
                lastAppendTimeRef.current = now
                onSignDetectedRef.current(assembledTextRef.current, json.data.confidence)
              }
            }
          } else {
            // Not recognised — flash the hint then return to 'listening'
            setCaptionHint('not_recognised')
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
            hintTimerRef.current = setTimeout(() => setCaptionHint('listening'), 2000)
            scheduleSpaceIfNeeded()
          }
        }
      } catch { /* network error — skip tick */ }
      finally { isSendingRef.current = false }
    }, 1500)

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      clearSpaceTimer()
    }
  }, [isRecording, scheduleSpaceIfNeeded, clearSpaceTimer])

  // ─── CLEAR TEXT ───────────────────────────────────────────────
  const clearText = useCallback(() => {
    assembledTextRef.current = ''
    lastAddedSignRef.current = ''
    clearSpaceTimer()
    setAssembledText('')
    setResult(null)
  }, [clearSpaceTimer])

  // ─── COMPACT MODE — fills parent container ────────────────────
  if (compact) {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: '#0A1628' }}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />
        {status === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white">Loading…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/80 text-white">{errorMsg || 'Camera error'}</span>
          </div>
        )}
        {isRecording && !result?.recognised && captionHint !== 'idle' && (
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg text-xs font-medium"
            style={{
              background: captionHint === 'not_recognised' ? 'rgba(232,68,90,0.85)' : 'rgba(0,0,0,0.55)',
              color: '#fff',
            }}
          >
            {captionHint === 'not_recognised' ? 'Not recognised — try again' : 'Listening…'}
          </div>
        )}
      </div>
    )
  }

  // ─── FULL MODE ────────────────────────────────────────────────
  const confPct   = result ? Math.min(result.confidence, 100) : 0
  const confColor = confPct >= 70 ? '#00D4AA' : confPct >= 50 ? '#F5A623' : '#E8445A'
  const handLabel =
    handsVisible === 2 ? '2 hands ✓' :
    handsVisible === 1 ? '1 hand ✓'  : 'No hands'

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-xl overflow-hidden" style={{ background: '#0A1628', aspectRatio: '4/3' }}>
        <video ref={videoRef} autoPlay playsInline muted
          className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />

        <div className="absolute top-3 left-3">
          {status === 'initializing' && (
            <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white">Loading…</span>
          )}
          {status === 'error' && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/80 text-white">{errorMsg}</span>
          )}
          {status === 'ready' && isRecording && (
            <span className="text-xs px-2 py-1 rounded-full text-white font-medium" style={{ background: '#00D4AA' }}>
              ● Recording
            </span>
          )}
          {status === 'ready' && !isRecording && (
            <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white">Ready</span>
          )}
        </div>

        {status === 'ready' && (
          <div className="absolute top-3 right-3">
            <span className="text-xs px-2 py-1 rounded-full text-white"
              style={{ background: handsVisible > 0 ? '#00D4AA22' : '#ffffff11', border: `1px solid ${handsVisible > 0 ? '#00D4AA' : '#ffffff33'}` }}>
              {handLabel}
            </span>
          </div>
        )}

        {result?.recognised && result.phrase && isRecording && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-white font-bold text-2xl"
            style={{ background: 'rgba(0,212,170,0.85)' }}>
            {result.translatedPhrase || result.phrase}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4 min-h-[64px] flex items-center justify-between gap-3"
        style={{ background: '#0A1628', border: '1px solid #1E3A5F' }}>
        <span className="font-mono text-lg tracking-widest flex-1 break-all"
          style={{ color: assembledText ? '#00D4AA' : '#4B6A8A' }}>
          {assembledText || (isRecording ? 'Sign letters to build text…' : 'Assembled text will appear here')}
        </span>
        {assembledText && (
          <button onClick={clearText} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: '#1E3A5F', color: '#9CA3AF' }}>
            Clear
          </button>
        )}
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: '#0A1628' }}>
          <span>Confidence</span>
          <span style={{ color: result ? confColor : '#9CA3AF' }}>
            {result?.recognised ? `${confPct}%` : '—'}
          </span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: '#E5E7EB' }}>
          <div className="h-2 rounded-full transition-all duration-300"
            style={{ width: result?.recognised ? `${confPct}%` : '0%', background: confColor }} />
        </div>
      </div>
    </div>
  )
}
