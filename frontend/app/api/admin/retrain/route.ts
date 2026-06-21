import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'ai-model', 'train_video_model.py')

    const logPath = path.join(process.cwd(), '..', 'ai-model', 'train.log')
    const logFile = await import('fs').then(fs =>
      fs.createWriteStream(logPath, { flags: 'w' })
    )

    const child = spawn('python', ['-u', scriptPath, '--json-only'], {
      detached: true,
      stdio:    ['ignore', logFile, logFile],
      cwd:      path.join(process.cwd(), '..'),
    })
    child.unref()

    return NextResponse.json({
      ok:      true,
      message: 'Retraining started — training on your recorded samples (fast mode). Check ai-model/train.log for progress.',
    })
  } catch (err) {
    console.error('[retrain]', err)
    return NextResponse.json({ error: 'Failed to start training' }, { status: 500 })
  }
}
