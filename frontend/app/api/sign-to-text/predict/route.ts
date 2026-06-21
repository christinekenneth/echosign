import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

const SERVER_SCRIPT             = path.join(process.cwd(), '..', 'ai-model', 'predict_server.py')
const SEQUENCE_CONFIDENCE_THRESHOLD = 15
const STARTUP_TIMEOUT_MS        = 30_000
const PREDICT_TIMEOUT_MS        = 10_000

// ─── PERSISTENT PYTHON PROCESS ────────────────────────────────
// The process is spawned once, loads the model, then handles every
// subsequent request in ~10ms instead of 8+ seconds.

let proc:    ChildProcess | null = null
let ready:   boolean             = false
let lineBuf: string              = ''

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
const queue: Pending[] = []

function spawnServer() {
  proc    = spawn('python', ['-u', SERVER_SCRIPT])
  ready   = false
  lineBuf = ''

  proc.stdout?.on('data', (chunk: Buffer) => {
    lineBuf += chunk.toString()
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed === 'ready') {
        ready = true
        console.log('[predict-server] Python model loaded and ready')
        continue
      }

      const pending = queue.shift()
      if (pending) {
        clearTimeout(pending.timer)
        pending.resolve(trimmed)
      }
    }
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    // suppress noisy MediaPipe/TF warnings; only log real errors
    const msg = chunk.toString()
    if (!msg.includes('W0000') && !msg.includes('I0000') && !msg.includes('clearcut')) {
      console.error('[predict-server] stderr:', msg.trimEnd())
    }
  })

  proc.on('exit', (code) => {
    console.warn(`[predict-server] Python exited (code ${code}) — will restart on next request`)
    proc  = null
    ready = false
    // Reject any queued requests
    while (queue.length) {
      const p = queue.shift()!
      clearTimeout(p.timer)
      p.reject(new Error('Python process exited unexpectedly'))
    }
  })

  proc.on('error', (err) => {
    console.error('[predict-server] Failed to start Python:', err.message)
    proc  = null
    ready = false
  })
}

function ensureServer(): Promise<void> {
  if (proc && ready) return Promise.resolve()

  if (!proc) spawnServer()

  // Wait for the 'ready' signal
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    const poll = () => {
      if (ready) return resolve()
      if (!proc)  return reject(new Error('Python failed to start'))
      if (Date.now() > deadline) return reject(new Error('Python startup timeout'))
      setTimeout(poll, 100)
    }
    poll()
  })
}

async function callPython(payload: object): Promise<PythonResult | null> {
  try {
    await ensureServer()
  } catch (err: any) {
    console.error('[predict-server] Not ready:', err.message)
    return null
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex(p => p.resolve === pending.resolve)
      if (idx >= 0) queue.splice(idx, 1)
      console.error('[predict-server] Prediction timeout')
      resolve(null)
    }, PREDICT_TIMEOUT_MS)

    const pending: Pending = {
      resolve: (line: string) => {
        try {
          const result = JSON.parse(line)
          if (result.error) {
            console.error('[predict-server] Python error:', result.error)
            return resolve(null)
          }
          resolve({
            sign:       result.sign       as string,
            label:      result.label      as string,
            phrase:     result.phrase     as string,
            confidence: Math.round((result.confidence as number) * 100),
            handUsed:   result.handUsed   as 'one' | 'two' | 'sequence',
            source:     result.source     as string,
          })
        } catch (e) {
          console.error('[predict-server] Parse error:', e, '| raw:', line)
          resolve(null)
        }
      },
      reject: () => resolve(null),
      timer,
    }

    queue.push(pending)
    proc!.stdin!.write(JSON.stringify(payload) + '\n')
  })
}

// ─── TRANSLATION ──────────────────────────────────────────────
async function translatePhrase(phrase: string, targetLang: string) {
  if (targetLang === 'en') return { text: phrase, confidence: 100 }
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrase)}&langpair=en|${targetLang}`
    const res  = await fetch(url)
    const data = await res.json()
    return {
      text:       data.responseData?.translatedText || phrase,
      confidence: Math.round((data.responseData?.match || 0) * 100),
    }
  } catch {
    return { text: phrase, confidence: 0 }
  }
}

// ─── TYPES ────────────────────────────────────────────────────
interface PythonResult {
  sign:       string
  label:      string
  phrase:     string
  confidence: number
  handUsed:   'one' | 'two' | 'sequence'
  source:     string
}

// ─── POST /api/sign-to-text/predict ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      frameSequence  = null,
      targetLanguage = 'en',
    } = body as {
      frameSequence:  number[] | null
      targetLanguage: string
    }

    let mlResult: PythonResult | null = null

    if (Array.isArray(frameSequence) && frameSequence.length === 3780) {
      mlResult = await callPython({ landmarks: frameSequence })
      if (mlResult && mlResult.confidence < SEQUENCE_CONFIDENCE_THRESHOLD) {
        console.log(`[predict-server] below threshold: ${mlResult.confidence}% — label: ${mlResult.label}`)
        mlResult = null
      }
    }

    if (!mlResult) {
      return NextResponse.json({
        status: 'success',
        data:   { recognised: false, message: 'Sign not recognised — hold the sign steady and try again.' },
      })
    }

    const { text: translatedPhrase, confidence: translationConfidence } =
      await translatePhrase(mlResult.phrase, targetLanguage)

    return NextResponse.json({
      status: 'success',
      data: {
        recognised:            true,
        sign:                  mlResult.sign,
        label:                 mlResult.label,
        phrase:                mlResult.phrase,
        translatedPhrase,
        targetLanguage,
        translationConfidence: targetLanguage === 'en' ? null : translationConfidence,
        confidence:            mlResult.confidence,
        handUsed:              mlResult.handUsed,
        source:                mlResult.source,
        detectionMethod:       'ml',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Prediction failed', error: String(error) },
      { status: 500 },
    )
  }
}

// ─── GET — health check ────────────────────────────────────────
export async function GET() {
  const testSeq = Array(3780).fill(0)
  const result  = await callPython({ landmarks: testSeq })

  return NextResponse.json({
    status:  'success',
    message: 'EchoSign Phrase Predict Endpoint',
    connectionTest: result
      ? { ok: true,  label: result.label, confidence: result.confidence }
      : { ok: false, reason: 'Python server did not respond' },
    model: 'asl_sequence_classifier.pkl',
  })
}
