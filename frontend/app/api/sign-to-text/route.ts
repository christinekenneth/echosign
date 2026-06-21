import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const PREDICT_SCRIPT = path.join(process.cwd(), '..', 'ai-model', 'predict.py')

// ─── ML MODEL CALLER ─────────────────────────────────────────
// Spawns predict.py, pipes landmarks JSON to stdin, reads result from stdout.
// Returns null on any error so the rule-based fallback takes over.
function callMLModel(
  landmarks: Landmark[],
  numHands: number
): Promise<{ sign: string; label: string; confidence: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn('python', [PREDICT_SCRIPT])
    let stdout = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.on('error', () => resolve(null))

    const timer = setTimeout(() => { proc.kill(); resolve(null) }, 5000)

    proc.on('close', () => {
      clearTimeout(timer)
      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) return resolve(null)
        resolve({ sign: result.sign, label: result.label, confidence: Math.round(result.confidence * 100) })
      } catch {
        resolve(null)
      }
    })

    const flat = landmarks.flatMap((lm) => [lm.x, lm.y, lm.z])
    proc.stdin.write(JSON.stringify({ landmarks: flat, num_hands: numHands }))
    proc.stdin.end()
  })
}

// ─── MEDIAPIPE HAND LANDMARK INDICES ─────────────────────────
const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
}

// ─── TYPES ────────────────────────────────────────────────────
interface Landmark { x: number; y: number; z: number }

interface SignDefinition {
  id: string
  phrase: string
  description: string
  category: string
}

// ─── SIGN POOLS ───────────────────────────────────────────────
// ONE_HAND_SIGNS — classified when only dominantHand is present.
// TWO_HAND_SIGNS — classified when both hands are visible.
// Keeping them in separate pools lets the same gesture (e.g. open palm)
// mean different things depending on whether the second hand is in frame.

const ONE_HAND_SIGNS: Record<string, SignDefinition> = {
  open_palm: {
    id: 'open_palm',
    phrase: 'I need help',
    description: 'Open palm facing forward, all fingers extended and spread',
    category: 'assistance',
  },
  pointing_index: {
    id: 'pointing_index',
    phrase: 'This one / here',
    description: 'Index finger extended and pointing, other fingers curled',
    category: 'reference',
  },
  flat_horizontal: {
    id: 'flat_horizontal',
    phrase: 'Money / payment',
    description: 'Flat open hand held horizontally, palm facing down',
    category: 'finance',
  },
  c_shape: {
    id: 'c_shape',
    phrase: 'Card',
    description: 'Hand curved into a C shape, fingers semi-curled with thumb spread',
    category: 'finance',
  },
  fist: {
    id: 'fist',
    phrase: 'Problem / issue',
    description: 'All fingers curled into a closed fist',
    category: 'complaint',
  },
}

const TWO_HAND_SIGNS: Record<string, SignDefinition> = {
  thumbs_up: {
    id: 'thumbs_up',
    phrase: 'Yes, that is correct',
    description: 'Thumb pointing upward, all other fingers curled',
    category: 'affirmative',
  },
  thumbs_down: {
    id: 'thumbs_down',
    phrase: 'No, that is not correct',
    description: 'Thumb pointing downward, all other fingers curled',
    category: 'negative',
  },
  open_hand_wave: {
    id: 'open_hand_wave',
    phrase: 'Hello',
    description: 'All fingers extended and spread open',
    category: 'greeting',
  },
  point: {
    id: 'point',
    phrase: 'My card is not working',
    description: 'Index finger extended, all other fingers curled',
    category: 'complaint_card',
  },
  fist_transfer: {
    id: 'fist_transfer',
    phrase: 'I have a problem with my money transfer',
    description: 'All fingers curled into a closed fist',
    category: 'complaint_transfer',
  },
}

const ALL_SIGNS: Record<string, SignDefinition> = { ...ONE_HAND_SIGNS, ...TWO_HAND_SIGNS }

const RECOGNITION_THRESHOLD = 50

// ─── HAND-SPACE NORMALISATION ─────────────────────────────────
// Translates raw MediaPipe landmarks into a coordinate system intrinsic to
// the hand itself so detection is orientation- and scale-independent:
//
//   Origin  — wrist (landmark 0)
//   +y axis — wrist → middle-MCP direction (the hand's own "up")
//   Scale   — wrist → middle-MCP distance = 1.0
//
// Extended = tip.y > mcp.y  (finger points away from palm in hand space)
// Curled   = tip.y < mcp.y
function normalizeToHandSpace(landmarks: Landmark[]): Landmark[] {
  const wrist = landmarks[LM.WRIST]
  const t = landmarks.map((lm) => ({
    x: lm.x - wrist.x,
    y: lm.y - wrist.y,
    z: lm.z - wrist.z,
  }))
  const ax = t[LM.MIDDLE_MCP].x
  const ay = t[LM.MIDDLE_MCP].y
  const mag = Math.sqrt(ax * ax + ay * ay)
  if (mag < 0.001) return t
  const m2 = mag * mag
  return t.map((lm) => ({
    x: (-ay * lm.x + ax * lm.y) / m2,
    y: (ax * lm.x + ay * lm.y) / m2,
    z: lm.z / mag,
  }))
}

// ─── HELPERS ──────────────────────────────────────────────────
function score(conditions: Array<[boolean, number]>): number {
  const total  = conditions.reduce((s, [, w]) => s + w, 0)
  const earned = conditions.reduce((s, [met, w]) => s + (met ? w : 0), 0)
  return Math.round((earned / total) * 100)
}

// In hand-normalised space +y points toward fingertips.
const extended = (lm: Landmark[], tip: number, mcp: number) => lm[tip].y > lm[mcp].y
const curled   = (lm: Landmark[], tip: number, mcp: number) => lm[tip].y < lm[mcp].y

// ─── TWO-HAND SIGN DETECTORS ──────────────────────────────────
// All receive normalised landmarks from the dominant hand.

function detectThumbsUp(lm: Landmark[]): number {
  return score([
    [lm[LM.THUMB_TIP].y > 0.5, 30],
    [curled(lm, LM.INDEX_TIP, LM.INDEX_MCP), 15],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 15],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 15],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 15],
    [lm[LM.THUMB_TIP].y > 1.0, 10],
  ])
}

function detectThumbsDown(lm: Landmark[]): number {
  return score([
    [lm[LM.THUMB_TIP].y < 0.0, 30],
    [curled(lm, LM.INDEX_TIP, LM.INDEX_MCP), 15],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 15],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 15],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 15],
    [lm[LM.THUMB_TIP].y < -0.3, 10],
  ])
}

function detectOpenHand(lm: Landmark[]): number {
  return score([
    [extended(lm, LM.INDEX_TIP, LM.INDEX_MCP), 20],
    [extended(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [extended(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [extended(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [Math.abs(lm[LM.INDEX_MCP].x - lm[LM.PINKY_MCP].x) > 0.15, 20],
  ])
}

function detectPoint(lm: Landmark[]): number {
  return score([
    [extended(lm, LM.INDEX_TIP, LM.INDEX_MCP), 30],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [(lm[LM.INDEX_TIP].y - lm[LM.INDEX_MCP].y) > 0.3, 10],
  ])
}

function detectFistTransfer(lm: Landmark[]): number {
  return score([
    [curled(lm, LM.INDEX_TIP, LM.INDEX_MCP), 20],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [lm[LM.THUMB_TIP].y >= 0.0 && lm[LM.THUMB_TIP].y <= 0.7, 20],
  ])
}

// ─── ONE-HAND SIGN DETECTORS ──────────────────────────────────
// norm = hand-normalised landmarks.
// raw  = original image-space landmarks (used only where hand orientation matters).

function detectOpenPalm(lm: Landmark[]): number {
  return score([
    [extended(lm, LM.INDEX_TIP, LM.INDEX_MCP), 20],
    [extended(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [extended(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [extended(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [Math.abs(lm[LM.INDEX_MCP].x - lm[LM.PINKY_MCP].x) > 0.15, 20],
  ])
}

function detectPointingIndex(lm: Landmark[]): number {
  return score([
    [extended(lm, LM.INDEX_TIP, LM.INDEX_MCP), 30],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [(lm[LM.INDEX_TIP].y - lm[LM.INDEX_MCP].y) > 0.3, 10],
  ])
}

// Flat horizontal: hand's natural axis (wrist → middle-MCP) runs more
// horizontally than vertically in the original image frame.
// Checked against raw image-space coordinates because normalisation removes
// absolute orientation; everything else uses the normalised landmarks.
function detectFlatHorizontal(norm: Landmark[], raw: Landmark[]): number {
  const dx = raw[LM.MIDDLE_MCP].x - raw[LM.WRIST].x
  const dy = raw[LM.MIDDLE_MCP].y - raw[LM.WRIST].y
  return score([
    [Math.abs(dx) > Math.abs(dy), 40],
    [extended(norm, LM.INDEX_TIP, LM.INDEX_MCP), 15],
    [extended(norm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 15],
    [extended(norm, LM.RING_TIP, LM.RING_MCP), 15],
    [extended(norm, LM.PINKY_TIP, LM.PINKY_MCP), 15],
  ])
}

// C-shape: fingers semi-curled (tip near MCP level — not fully extended,
// not fully curled) and thumb visibly spread to the side.
function detectCShape(lm: Landmark[]): number {
  const semiCurled = (tip: number, mcp: number) =>
    lm[tip].y >= lm[mcp].y - 0.15 && lm[tip].y <= lm[mcp].y + 0.5

  return score([
    [semiCurled(LM.INDEX_TIP, LM.INDEX_MCP), 20],
    [semiCurled(LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [semiCurled(LM.RING_TIP, LM.RING_MCP), 20],
    [semiCurled(LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [Math.abs(lm[LM.THUMB_TIP].x) > 0.3, 20],
  ])
}

function detectFistSimple(lm: Landmark[]): number {
  return score([
    [curled(lm, LM.INDEX_TIP, LM.INDEX_MCP), 20],
    [curled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP), 20],
    [curled(lm, LM.RING_TIP, LM.RING_MCP), 20],
    [curled(lm, LM.PINKY_TIP, LM.PINKY_MCP), 20],
    [lm[LM.THUMB_TIP].y >= 0.0 && lm[LM.THUMB_TIP].y <= 0.7, 20],
  ])
}

// ─── CLASSIFIERS ──────────────────────────────────────────────

function detectOneHandSign(raw: Landmark[]): { signId: string; confidence: number } {
  const norm = normalizeToHandSpace(raw)
  return [
    { signId: 'open_palm',       confidence: detectOpenPalm(norm) },
    { signId: 'pointing_index',  confidence: detectPointingIndex(norm) },
    { signId: 'flat_horizontal', confidence: detectFlatHorizontal(norm, raw) },
    { signId: 'c_shape',         confidence: detectCShape(norm) },
    { signId: 'fist',            confidence: detectFistSimple(norm) },
  ].reduce((best, r) => (r.confidence > best.confidence ? r : best))
}

function detectTwoHandSign(domRaw: Landmark[]): { signId: string; confidence: number } {
  const norm = normalizeToHandSpace(domRaw)
  return [
    { signId: 'thumbs_up',      confidence: detectThumbsUp(norm) },
    { signId: 'thumbs_down',    confidence: detectThumbsDown(norm) },
    { signId: 'open_hand_wave', confidence: detectOpenHand(norm) },
    { signId: 'point',          confidence: detectPoint(norm) },
    { signId: 'fist_transfer',  confidence: detectFistTransfer(norm) },
  ].reduce((best, r) => (r.confidence > best.confidence ? r : best))
}

// ─── TRANSLATION ──────────────────────────────────────────────
async function translatePhrase(
  phrase: string,
  targetLang: string
): Promise<{ text: string; confidence: number }> {
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

// ─── VALIDATION HELPER ────────────────────────────────────────
function isValidLandmarkArray(arr: unknown): arr is Landmark[] {
  return (
    Array.isArray(arr) &&
    arr.length === 21 &&
    arr.every(
      (lm: unknown) => {
        const l = lm as Record<string, unknown>
        return typeof l?.x === 'number' && typeof l?.y === 'number' && typeof l?.z === 'number'
      }
    )
  )
}

// ─── POST /api/sign-to-text ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      dominantHand,
      secondaryHand     = null,
      dominantHandedness = 'right',
      targetLanguage    = 'en',
    } = body

    if (!isValidLandmarkArray(dominantHand)) {
      return NextResponse.json(
        { status: 'error', message: 'dominantHand must be an array of exactly 21 {x,y,z} landmarks' },
        { status: 400 }
      )
    }

    if (secondaryHand !== null && !isValidLandmarkArray(secondaryHand)) {
      return NextResponse.json(
        { status: 'error', message: 'secondaryHand must be null or an array of exactly 21 {x,y,z} landmarks' },
        { status: 400 }
      )
    }

    const bothHands = secondaryHand !== null
    const numHands  = bothHands ? 2 : 1

    // Try trained ML model first; fall back to rule-based if unavailable
    const mlResult = await callMLModel(dominantHand, numHands)

    if (mlResult && mlResult.confidence >= RECOGNITION_THRESHOLD) {
      const { text: translatedPhrase, confidence: translationConfidence } =
        await translatePhrase(mlResult.sign, targetLanguage)
      return NextResponse.json({
        status: 'success',
        data: {
          recognised:            true,
          sign:                  mlResult.sign,
          label:                 mlResult.label,
          handedness:            dominantHandedness,
          bothHands,
          phrase:                mlResult.sign,
          translatedPhrase,
          targetLanguage,
          translationConfidence: targetLanguage === 'en' ? null : translationConfidence,
          confidence:            mlResult.confidence,
          category:              'bsl_alphabet',
          detectionMethod:       'ml',
        },
      })
    }

    // Rule-based fallback
    const { signId, confidence } = bothHands
      ? detectTwoHandSign(dominantHand)
      : detectOneHandSign(dominantHand)

    const signPool = bothHands ? TWO_HAND_SIGNS : ONE_HAND_SIGNS

    if (confidence < RECOGNITION_THRESHOLD) {
      return NextResponse.json({
        status: 'success',
        data: {
          recognised: false,
          confidence,
          handedness: dominantHandedness,
          bothHands,
          message: 'Sign not recognised — confidence too low.',
          suggestions: Object.values(signPool).map((s) => ({ id: s.id, description: s.description })),
        },
      })
    }

    const sign = ALL_SIGNS[signId]
    const { text: translatedPhrase, confidence: translationConfidence } =
      await translatePhrase(sign.phrase, targetLanguage)

    return NextResponse.json({
      status: 'success',
      data: {
        recognised:            true,
        sign:                  sign.id,
        handedness:            dominantHandedness,
        bothHands,
        phrase:                sign.phrase,
        translatedPhrase,
        targetLanguage,
        translationConfidence: targetLanguage === 'en' ? null : translationConfidence,
        confidence,
        category:              sign.category,
        detectionMethod:       'rule-based',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Sign detection failed', error: String(error) },
      { status: 500 }
    )
  }
}

// ─── GET /api/sign-to-text ────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status:  'success',
    message: 'EchoSign Sign-to-Text Endpoint',
    description: 'Detects BSL hand signs from MediaPipe landmark data and returns a translated phrase.',
    usage: {
      method: 'POST',
      body: {
        dominantHand:       'Required. Array of exactly 21 {x,y,z} landmarks for the primary hand.',
        secondaryHand:      'Optional. Array of 21 landmarks for the second hand, or null. Switches to two-hand sign vocabulary when present.',
        dominantHandedness: 'Optional. "right" or "left". Default: "right".',
        targetLanguage:     'Optional. Language code e.g. "yo", "ha", "es". Default: "en".',
      },
      notes: [
        'Detection is orientation-independent — landmarks are normalised to hand space before classification.',
        'One-hand signs are detected when secondaryHand is null.',
        'Two-hand signs are detected when secondaryHand is provided.',
        'Confidence is not penalised for one-hand signing — both pools use the same 0–100 scale.',
        'Returns recognised: false with pool-specific suggestions when confidence < 50.',
        'phrase is always English; translatedPhrase is in targetLanguage.',
      ],
    },
    oneHandSigns: Object.values(ONE_HAND_SIGNS).map((s) => ({
      id: s.id, phrase: s.phrase, description: s.description, category: s.category,
    })),
    twoHandSigns: Object.values(TWO_HAND_SIGNS).map((s) => ({
      id: s.id, phrase: s.phrase, description: s.description, category: s.category,
    })),
    bslAlphabetSigns: {
      note: 'Recognised by trained ML model (Random Forest on MediaPipe landmarks). One-hand signs use dominantHand only; two-hand signs require secondaryHand.',
      oneHand: ['C', 'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'],
      twoHand: ['A', 'B', 'D', 'E', 'F', 'G', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'Ten', 'U', 'V', 'W', 'X', 'Z'],
    },
    landmarkReference: 'MediaPipe Hands — 21 keypoints. 0=wrist, 4=thumb tip, 8=index tip, 12=middle tip, 16=ring tip, 20=pinky tip.',
    detectionMethods: {
      ml: 'Trained Random Forest on Kaggle BSL landmark dataset — covers alphabet and numbers.',
      ruleBased: 'Hand-coded geometric scoring — covers 5 one-hand and 5 two-hand complaint phrases.',
      priority: 'ML model is tried first; rule-based activates if model is unavailable or confidence < 50.',
    },
  })
}
