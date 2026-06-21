import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ─── COMPLAINT CATEGORIES ────────────────────────────────────
const CATEGORIES = [
  {
    id: 'failed_transfer',
    label: 'Failed or delayed transfer',
    keywords: [
      'transfer', 'send money', 'payment', 'transaction',
      'not received', 'failed', 'delayed', 'pending',
      'sent', 'wire', 'remittance', 'deposit'
    ],
  },
  {
    id: 'card_problem',
    label: 'Card not working',
    keywords: [
      'card', 'atm card', 'debit', 'credit', 'blocked',
      'declined', 'plastic', 'chip', 'pin', 'swipe', 'tap'
    ],
  },
  {
    id: 'atm_issue',
    label: 'ATM problem',
    keywords: [
      'atm', 'cash machine', 'withdrawal', 'dispenser',
      'machine', 'swallowed', 'cash', 'dispensed'
    ],
  },
  {
    id: 'account_access',
    label: 'Cannot access account',
    keywords: [
      'login', 'access', 'locked', 'password', 'account',
      'blocked', 'sign in', 'log in', 'frozen', 'suspended'
    ],
  },
  {
    id: 'fraud',
    label: 'Fraud or stolen money',
    keywords: [
      'fraud', 'stolen', 'scam', 'unauthorized', 'hacked',
      'theft', 'emptied', 'someone', 'unknown', 'suspicious'
    ],
  },
  {
    id: 'other',
    label: 'Other issue',
    keywords: [],
  },
]

// ─── KEYWORD CATEGORISATION ───────────────────────────────────
function keywordCategorise(englishText: string): {
  categoryId: string
  categoryLabel: string
  confidence: number
} {
  const text = englishText.toLowerCase()
  let bestMatch = {
    categoryId: 'other',
    categoryLabel: 'Other issue',
    confidence: 30,
  }
  let highestScore = 0

  for (const category of CATEGORIES) {
    if (category.id === 'other') continue

    let score = 0
    for (const keyword of category.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score++
      }
    }

    if (score > highestScore) {
      highestScore = score
      bestMatch = {
        categoryId: category.id,
        categoryLabel: category.label,
        confidence: Math.min(score * 20, 95),
      }
    }
  }

  return bestMatch
}

// ─── AI CATEGORISATION ────────────────────────────────────────
// Only runs when ANTHROPIC_API_KEY is in .env.local
// and keyword confidence is below 60%
async function aiCategorise(englishText: string): Promise<{
  categoryId: string
  categoryLabel: string
  confidence: number
  method: string
}> {
  try {
    const categoryList = CATEGORIES.map(
      (c) => `${c.id}: ${c.label}`
    ).join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `You are a complaint classification system for EchoSign, an accessibility platform for deaf and hard-of-hearing users.

Classify this complaint into exactly one of these categories:
${categoryList}

Complaint: "${englishText}"

Respond with ONLY a JSON object, nothing else:
{
  "categoryId": "the_category_id",
  "categoryLabel": "The Category Label",
  "confidence": 85
}`,
          },
        ],
      }),
    })

    const data = await response.json()
    const content = data.content[0]?.text || ''
    const clean = content.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      categoryId: parsed.categoryId || 'other',
      categoryLabel: parsed.categoryLabel || 'Other issue',
      confidence: parsed.confidence || 70,
      method: 'ai',
    }
  } catch {
    return {
      categoryId: 'other',
      categoryLabel: 'Other issue',
      confidence: 30,
      method: 'fallback',
    }
  }
}

// ─── SMART CATEGORISATION ─────────────────────────────────────
// Keywords first — AI fallback when confidence is low
// AI only activates when ANTHROPIC_API_KEY exists in .env.local
async function categoriseComplaint(englishText: string): Promise<{
  categoryId: string
  categoryLabel: string
  confidence: number
  method: string
}> {
  const keywordResult = keywordCategorise(englishText)

  if (
    keywordResult.confidence < 60 &&
    process.env.ANTHROPIC_API_KEY
  ) {
    const aiResult = await aiCategorise(englishText)
    return aiResult
  }

  return {
    ...keywordResult,
    method: 'keyword',
  }
}

// ─── GENERATE REFERENCE NUMBER ───────────────────────────────
function generateReference(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 9000) + 1000
  return `EC-${year}${month}${day}-${random}`
}

// ─── TRANSLATE TO ENGLISH ─────────────────────────────────────
async function translateToEnglish(
  text: string,
  fromLanguage: string
): Promise<{ englishText: string; confidence: number }> {
  if (fromLanguage === 'en') {
    return { englishText: text, confidence: 100 }
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${fromLanguage}|en`
    const response = await fetch(url)
    const data = await response.json()

    return {
      englishText: data.responseData?.translatedText || text,
      confidence: Math.round((data.responseData?.match || 0) * 100),
    }
  } catch {
    return { englishText: text, confidence: 0 }
  }
}

// ─── POST /api/complaint ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, language, inputMode, sector, institutionId } = body

    // Validation
    if (!text || !language) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'text and language are required',
        },
        { status: 400 }
      )
    }

    if (text.trim().length < 5) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Complaint text is too short — please provide more detail',
        },
        { status: 400 }
      )
    }

    // Step 1 — Translate to English
    const { englishText, confidence: translationConfidence } =
      await translateToEnglish(text, language)

    // Step 2 — Categorise
    const category = await categoriseComplaint(englishText)

    // Step 3 — Generate reference
    const reference = generateReference()

    // Step 4 — Save to database
    const { data: complaint, error } = await supabaseAdmin
      .from('complaints')
      .insert({
        reference,
        issue_type: category.categoryId,
        sector: sector || 'finance',
        original_language: language,
        original_text: text,
        english_text: englishText,
        translation_confidence: translationConfidence,
        input_mode: inputMode || 'text',
        status: 'received',
        institution_id: institutionId || null,
      })
      .select()
      .single()

    if (error) throw error

    // Step 5 — Return success
    return NextResponse.json({
      status: 'success',
      message: 'Complaint submitted successfully',
      data: {
        reference: complaint.reference,
        category: {
          id: category.categoryId,
          label: category.categoryLabel,
          confidence: category.confidence,
          classifiedBy: category.method,
        },
        translationConfidence,
        status: 'received',
        submittedAt: complaint.created_at,
        nextSteps:
          'Your complaint has been received and will be reviewed shortly. Use your reference number to track progress.',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to submit complaint',
        error: String(error),
      },
      { status: 500 }
    )
  }
}

// ─── GET /api/complaint ───────────────────────────────────────
// ?list=true  → returns all complaints from the database
// (no param)  → returns endpoint documentation
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  if (searchParams.get('list') !== 'true') {
    return NextResponse.json({
      status: 'success',
      message: 'EchoSign Complaint Submission Endpoint',
      usage: {
        method: 'POST',
        body: {
          text:          'Complaint text in any supported language',
          language:      'Language code e.g. yo, en, ha, ig, fr',
          inputMode:     'text or sign',
          sector:        'finance, healthcare, education, government, telecoms',
          institutionId: 'ID of the institution (optional)',
        },
        example: {
          text:      'My card is not working and I cannot withdraw money',
          language:  'en',
          inputMode: 'text',
          sector:    'finance',
        },
      },
      categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    })
  }

  try {
    const { data: complaints, error } = await supabaseAdmin
      .from('complaints')
      .select('id, reference, issue_type, sector, original_language, original_text, english_text, status, input_mode, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const ISSUE_LABELS: Record<string, string> = {
      failed_transfer: 'Failed or delayed transfer',
      card_problem:    'Card not working',
      atm_issue:       'ATM problem',
      account_access:  'Cannot access account',
      fraud:           'Fraud or stolen money',
      other:           'Other issue',
    }

    return NextResponse.json({
      status: 'success',
      data: {
        complaints: (complaints ?? []).map((c) => ({
          id:          c.id,
          reference:   c.reference,
          issueType:   c.issue_type,
          issueLabel:  ISSUE_LABELS[c.issue_type] ?? c.issue_type,
          sector:      c.sector,
          language:    c.original_language,
          text:        c.original_text,
          englishText: c.english_text,
          status:      c.status,
          inputMode:   c.input_mode,
          submittedAt: c.created_at,
          updatedAt:   c.updated_at,
        })),
        total: complaints?.length ?? 0,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch complaints', error: String(error) },
      { status: 500 }
    )
  }
}