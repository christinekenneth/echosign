import { NextRequest, NextResponse } from 'next/server'

// List of supported languages
// This will work for all these languages via MyMemory
// and even more when we switch to Google Translate
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
  { code: 'fr', name: 'French' },
  { code: 'ar', name: 'Arabic' },
  { code: 'sw', name: 'Swahili' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
]

// This function translates text using MyMemory API
// MyMemory is free and requires no API key
// We will swap this for Google Translate later
async function translateWithMyMemory(
  text: string,
  fromLang: string,
  toLang: string
): Promise<{ translatedText: string; confidence: number }> {
  
  // If the source and target language are the same
  // no translation needed — return as is
  if (fromLang === toLang) {
    return { translatedText: text, confidence: 100 }
  }

  // Build the MyMemory API URL
  // Format is: langpair=sourceLang|targetLang
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`

  const response = await fetch(url)
  const data = await response.json()

  // MyMemory returns a match value between 0 and 1
  // We multiply by 100 to get a percentage
  const confidence = Math.round(
    (data.responseData?.match || 0) * 100
  )

  return {
    translatedText: data.responseData?.translatedText || text,
    confidence,
  }
}

// This runs when someone calls POST /api/translate
export async function POST(request: NextRequest) {
  try {
    // Read the request body
    const body = await request.json()
    const { text, fromLanguage, toLanguage } = body

    // Validate — make sure all required fields are present
    if (!text || !fromLanguage || !toLanguage) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'text, fromLanguage and toLanguage are required',
        },
        { status: 400 }
      )
    }

    // Validate — make sure text is not empty
    if (text.trim().length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'text cannot be empty',
        },
        { status: 400 }
      )
    }

    // Step 1 — Translate from source language to English
    // English is our pivot language
    // All text goes through English before going anywhere else
    let englishText = text
    let toEnglishConfidence = 100

    if (fromLanguage !== 'en') {
      const result = await translateWithMyMemory(text, fromLanguage, 'en')
      englishText = result.translatedText
      toEnglishConfidence = result.confidence
    }

    // Step 2 — Translate from English to target language
    // If target is already English we skip this step
    let finalText = englishText
    let toTargetConfidence = 100

    if (toLanguage !== 'en') {
      const result = await translateWithMyMemory(englishText, 'en', toLanguage)
      finalText = result.translatedText
      toTargetConfidence = result.confidence
    }

    // Calculate overall confidence
    // If we did two translations, average the confidence scores
    const overallConfidence = fromLanguage !== 'en' && toLanguage !== 'en'
      ? Math.round((toEnglishConfidence + toTargetConfidence) / 2)
      : Math.max(toEnglishConfidence, toTargetConfidence)

    // Return the result
    return NextResponse.json({
  status: 'success',
  data: {
    originalText: text,
    originalLanguage: fromLanguage,
    translatedText: finalText,
    targetLanguage: toLanguage,
    confidence: overallConfidence,
    service: 'mymemory',
  },
})

  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Translation failed',
        error: String(error),
      },
      { status: 500 }
    )
  }
}

// This runs when someone calls GET /api/translate
// It tells developers what languages are supported
export async function GET() {
  return NextResponse.json({
    status: 'success',
    message: 'EchoSign Translation Endpoint',
    supportedLanguages: SUPPORTED_LANGUAGES,
    usage: {
      method: 'POST',
      body: {
        text: 'The text you want to translate',
        fromLanguage: 'Language code e.g. yo for Yoruba',
        toLanguage: 'Language code e.g. en for English',
      },
      example: {
        text: 'Mo fẹ ẹdun nipa gbigbe owo mi',
        fromLanguage: 'yo',
        toLanguage: 'en',
      },
    },
  })
}