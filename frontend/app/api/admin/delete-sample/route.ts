import { NextRequest, NextResponse } from 'next/server'
import { unlink, readdir } from 'fs/promises'
import path from 'path'

const SAMPLES_DIR = path.join(process.cwd(), '..', 'ai-model', 'data', 'landmark_samples')

export async function POST(req: NextRequest) {
  try {
    const { label } = await req.json()
    if (!label) return NextResponse.json({ error: 'Missing label' }, { status: 400 })

    const labelDir = path.join(SAMPLES_DIR, label)
    let files: string[]
    try {
      files = (await readdir(labelDir)).filter(f => f.endsWith('.json')).sort()
    } catch {
      return NextResponse.json({ ok: true, count: 0 })
    }

    if (files.length === 0) return NextResponse.json({ ok: true, count: 0 })

    // Delete the most recent sample (last alphabetically = highest timestamp)
    await unlink(path.join(labelDir, files[files.length - 1]))

    return NextResponse.json({ ok: true, count: files.length - 1 })
  } catch (err) {
    console.error('[delete-sample]', err)
    return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 })
  }
}
