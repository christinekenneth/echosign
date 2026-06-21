import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readdir } from 'fs/promises'
import path from 'path'

const SAMPLES_DIR = path.join(process.cwd(), '..', 'ai-model', 'data', 'landmark_samples')

export async function GET() {
  try {
    await mkdir(SAMPLES_DIR, { recursive: true })
    const labels = await readdir(SAMPLES_DIR)
    const counts: Record<string, number> = {}
    await Promise.all(labels.map(async (label) => {
      const files = await readdir(path.join(SAMPLES_DIR, label))
      counts[label] = files.filter(f => f.endsWith('.json')).length
    }))
    return NextResponse.json({ ok: true, counts })
  } catch (err) {
    console.error('[sample-counts]', err)
    return NextResponse.json({ ok: true, counts: {} })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { label, frames } = await req.json()

    if (!label || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'Missing label or frames' }, { status: 400 })
    }

    const labelDir = path.join(SAMPLES_DIR, label)
    await mkdir(labelDir, { recursive: true })

    const timestamp = Date.now()
    const filename  = `sample_${timestamp}.json`
    await writeFile(
      path.join(labelDir, filename),
      JSON.stringify({ label, frames }),
      'utf-8',
    )

    const files = await readdir(labelDir)
    const count = files.filter(f => f.endsWith('.json')).length

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('[save-sample]', err)
    return NextResponse.json({ error: 'Failed to save sample' }, { status: 500 })
  }
}
