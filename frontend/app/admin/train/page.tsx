'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const PHRASES = [
  { label: 'account_forgot_password', display: 'I forgot my password' },
  { label: 'account_locked',          display: 'My account is locked' },
  { label: 'account_mobile_fail',     display: 'I cannot access mobile banking' },
  { label: 'account_suspended',       display: 'My account was suspended' },
  { label: 'card_blocked',            display: 'My card was blocked' },
  { label: 'card_lost',               display: 'I lost my card' },
  { label: 'card_not_working',        display: 'My card is not working' },
  { label: 'card_pin_fail',           display: 'My card PIN is not working' },
  { label: 'card_stolen',             display: 'My card was stolen' },
  { label: 'fraud_hacked',            display: 'My account was hacked' },
  { label: 'fraud_money_stolen',      display: 'Someone stole my money' },
  { label: 'fraud_scammed',           display: 'I was scammed' },
  { label: 'fraud_unauthorised',      display: 'Unauthorised transaction on my account' },
  { label: 'greet_dont_understand',   display: 'I do not understand' },
  { label: 'greet_finished',          display: 'I am finished' },
  { label: 'greet_hello',             display: 'Hello' },
]

const TARGET      = 5
const SEQ_LEN     = 30
const CAPTURE_MS  = 12000   // how long to record per sample (ms)
const CDN         = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic'

// Resample N collected frames down to exactly SEQ_LEN via linspace
function resampleFrames(frames: number[][]): number[][] {
  const n = frames.length
  if (n === 0) return []
  if (n <= SEQ_LEN) return frames
  return Array.from({ length: SEQ_LEN }, (_, i) => {
    const idx = Math.round((i / (SEQ_LEN - 1)) * (n - 1))
    return frames[idx]
  })
}

type State = 'idle' | 'countdown' | 'capturing' | 'saving' | 'saved' | 'error'

export default function TrainPage() {
  const router = useRouter()

  const videoRef      = useRef<HTMLVideoElement>(null)
  const holisticRef   = useRef<any>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number | null>(null)
  const processingRef = useRef(false)
  const framesBufRef  = useRef<number[][]>([])
  const capturingRef  = useRef(false)

  const [ready,        setReady]        = useState(false)
  const [currentIdx,   setCurrentIdx]   = useState(0)
  const [counts,       setCounts]       = useState<Record<string, number>>({})
  const [state,        setState]        = useState<State>('idle')
  const [countdown,    setCountdown]    = useState(3)
  const [framesDone,   setFramesDone]   = useState(0)
  const [retraining,   setRetraining]   = useState(false)
  const [retrainMsg,   setRetrainMsg]   = useState('')

  const phrase = PHRASES[currentIdx]

  // ── Load existing counts from disk ───────────────────────────
  useEffect(() => {
    fetch('/api/admin/save-sample')
      .then(r => r.json())
      .then(j => { if (j.ok) setCounts(j.counts) })
      .catch(() => {})
  }, [])

  // ── Camera + Holistic ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      })
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await new Promise<void>(res => { video.onloadedmetadata = () => res() })
      await video.play()

      const mp = await import('@mediapipe/holistic')
      if (!mounted) return

      const holistic = new mp.Holistic({ locateFile: (f: string) => `${CDN}/${f}` })
      holistic.setOptions({
        modelComplexity: 1, smoothLandmarks: true,
        enableSegmentation: false, refineFaceLandmarks: false,
        minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      })

      holistic.onResults((results: any) => {
        if (!capturingRef.current) return
        const leftLMs  = results.leftHandLandmarks  ?? null
        const rightLMs = results.rightHandLandmarks ?? null
        const left63   = leftLMs  ? leftLMs.flatMap( (lm: any) => [lm.x, lm.y, lm.z]) : new Array(63).fill(0)
        const right63  = rightLMs ? rightLMs.flatMap((lm: any) => [lm.x, lm.y, lm.z]) : new Array(63).fill(0)
        framesBufRef.current.push([...left63, ...right63])
        setFramesDone(framesBufRef.current.length)
      })

      holisticRef.current = holistic

      const loop = async () => {
        if (!mounted) return
        if (holisticRef.current && video.readyState >= 2 && !processingRef.current) {
          processingRef.current = true
          try { await holisticRef.current.send({ image: video }) } catch {}
          finally { processingRef.current = false }
        }
        if (mounted) rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      if (mounted) setReady(true)
    }

    init().catch(() => setState('error'))
    return () => {
      mounted = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      holisticRef.current?.close()
    }
  }, [])

  // ── Record one sample ─────────────────────────────────────────
  const record = useCallback(async () => {
    if (state !== 'idle' || !ready) return

    // Countdown
    setState('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise(r => setTimeout(r, 1000))
    }

    // Capture — run for the full CAPTURE_MS window, then resample
    framesBufRef.current = []
    capturingRef.current = true
    setFramesDone(0)
    setState('capturing')

    const captureStart = Date.now()
    await new Promise<void>(res => {
      const ticker = setInterval(() => {
        setFramesDone(Math.min(Date.now() - captureStart, CAPTURE_MS))
      }, 80)
      setTimeout(() => { clearInterval(ticker); setFramesDone(CAPTURE_MS); res() }, CAPTURE_MS)
    })

    capturingRef.current = false
    const frames = resampleFrames(framesBufRef.current)

    if (frames.length < 10) {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
      return
    }

    // Save
    setState('saving')
    try {
      const res  = await fetch('/api/admin/save-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: phrase.label, frames }),
      })
      const json = await res.json()
      setCounts(prev => ({ ...prev, [phrase.label]: json.count }))
      setState('saved')
      setTimeout(() => setState('idle'), 1200)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }, [state, ready, phrase.label])

  // ── Retrain ───────────────────────────────────────────────────
  const retrain = async () => {
    setRetraining(true)
    setRetrainMsg('')
    try {
      const res  = await fetch('/api/admin/retrain', { method: 'POST' })
      const json = await res.json()
      setRetrainMsg(json.message)
    } catch {
      setRetrainMsg('Failed to start — check terminal')
    } finally {
      setRetraining(false)
    }
  }

  // ── Delete last sample for current phrase ─────────────────────
  const retakeLast = async () => {
    if (state !== 'idle') return
    try {
      const res  = await fetch('/api/admin/delete-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: phrase.label }),
      })
      const json = await res.json()
      setCounts(prev => ({ ...prev, [phrase.label]: json.count }))
    } catch {
      // ignore
    }
  }

  const totalSamples = Object.values(counts).reduce((a, b) => a + b, 0)

  const btnLabel =
    state === 'countdown' ? `Get ready… ${countdown}` :
    state === 'capturing' ? 'Capturing…' :
    state === 'saving'    ? 'Saving…'    :
    state === 'saved'     ? 'Saved ✓'    :
    state === 'error'     ? 'No hands — try again' : '● Record'

  return (
    <div className="flex min-h-screen" style={{ background: '#0A1628' }}>

      {/* ── Phrase list sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r border-white/10 flex flex-col" style={{ background: '#06101E' }}>
        <div className="px-4 py-5 border-b border-white/10">
          <button onClick={() => router.push('/admin')} className="text-white/40 hover:text-white/70 text-xs mb-3 block">
            ← Admin
          </button>
          <p className="text-white font-bold text-sm">Train your signing</p>
          <p className="text-white/40 text-xs mt-1">Record {TARGET} samples per phrase</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {PHRASES.map((p, i) => {
            const count  = counts[p.label] ?? 0
            const done   = count >= TARGET
            const active = i === currentIdx
            return (
              <button
                key={p.label}
                onClick={() => { setCurrentIdx(i); setState('idle') }}
                className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
                style={{ background: active ? 'rgba(0,212,170,0.1)' : 'transparent' }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: done ? '#00D4AA' : active ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                  }}
                >
                  {done ? '✓' : count > 0 ? count : ''}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: active ? '#00D4AA' : done ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)' }}
                >
                  {p.display}
                </span>
              </button>
            )
          })}
        </div>

        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          <p className="text-white/30 text-xs">{totalSamples} total samples</p>
          <button
            onClick={retrain}
            disabled={totalSamples === 0 || retraining}
            className="w-full py-2.5 rounded-lg text-xs font-bold transition-colors"
            style={{
              background: totalSamples > 0 && !retraining ? '#00D4AA' : 'rgba(255,255,255,0.08)',
              color: totalSamples > 0 && !retraining ? '#0A1628' : 'rgba(255,255,255,0.25)',
            }}
          >
            {retraining ? 'Starting…' : 'Retrain model'}
          </button>
          {retrainMsg && (
            <p className="text-white/50 text-xs leading-relaxed">{retrainMsg}</p>
          )}
        </div>
      </aside>

      {/* ── Main capture area ── */}
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">

        {/* Phrase to sign */}
        <div className="text-center">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Sign this phrase</p>
          <p className="text-white font-black text-3xl">{phrase.display}</p>
          <p className="text-white/20 text-xs mt-1 font-mono">{phrase.label}</p>
        </div>

        {/* Camera */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ width: 400, height: 300, background: '#06101E', border: '2px solid rgba(255,255,255,0.08)' }}
        >
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/40 text-sm">Starting camera…</span>
            </div>
          )}

          {state === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
              <span className="text-white font-black" style={{ fontSize: 96 }}>{countdown}</span>
            </div>
          )}

          {state === 'capturing' && (
            <>
              <div className="absolute top-3 left-3">
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#E8445A', color: '#fff' }}>
                  ● REC
                </span>
              </div>
              <div className="absolute inset-x-4 bottom-4 space-y-1">
                <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min((framesDone / CAPTURE_MS) * 100, 100)}%`, background: '#00D4AA' }}
                  />
                </div>
                <p className="text-white/60 text-xs text-center">
                  {Math.ceil((CAPTURE_MS - framesDone) / 1000)}s remaining
                </p>
              </div>
            </>
          )}

          {state === 'saved' && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,212,170,0.2)' }}>
              <span className="text-white font-black text-3xl">Saved ✓</span>
            </div>
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(232,68,90,0.2)' }}>
              <span className="text-white font-bold text-sm">No hands detected — try again</span>
            </div>
          )}
        </div>

        {/* Sample dots */}
        <div className="flex gap-2">
          {Array.from({ length: TARGET }).map((_, i) => {
            const filled = i < (counts[phrase.label] ?? 0)
            return (
              <div
                key={i}
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: filled ? '#00D4AA' : 'rgba(255,255,255,0.08)', color: filled ? '#0A1628' : 'rgba(255,255,255,0.3)' }}
              >
                {filled ? '✓' : i + 1}
              </div>
            )
          })}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={record}
            disabled={state !== 'idle' || !ready}
            className="px-10 py-3 rounded-xl font-bold text-sm transition-colors"
            style={{
              background: state === 'idle' && ready ? '#00D4AA' : 'rgba(255,255,255,0.08)',
              color:      state === 'idle' && ready ? '#0A1628' : 'rgba(255,255,255,0.3)',
            }}
          >
            {btnLabel}
          </button>

          {(counts[phrase.label] ?? 0) > 0 && state === 'idle' && (
            <button
              onClick={retakeLast}
              className="px-6 py-3 rounded-xl font-bold text-sm"
              style={{ background: 'rgba(232,68,90,0.18)', color: '#E8445A', border: '1px solid rgba(232,68,90,0.4)' }}
            >
              ✕ Retake last
            </button>
          )}

          {currentIdx < PHRASES.length - 1 && (
            <button
              onClick={() => { setCurrentIdx(prev => prev + 1); setState('idle') }}
              className="px-6 py-3 rounded-xl font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
            >
              Next →
            </button>
          )}
        </div>

        <p className="text-white/25 text-xs text-center max-w-xs">
          Sign naturally, then click Record. Aim for 5 takes per phrase so the model learns your signing style.
        </p>
      </main>
    </div>
  )
}
