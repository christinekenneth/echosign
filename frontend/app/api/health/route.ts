import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Test database connection
    const { error } = await supabase
      .from('complaints')
      .select('count')
      .limit(1)

    if (error) throw error

    return NextResponse.json({
      status: 'success',
      message: 'EchoSign API is live',
      version: '1.0.0',
      database: 'connected',
      timestamp: new Date().toISOString(),
      endpoints: [
        'GET  /api/health',
        'POST /api/translate',
        'POST /api/complaint',
        'GET  /api/complaint/[reference]',
        'POST /api/sign-to-text',
      ],
    })

  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Database connection failed',
        error: String(error),
      },
      { status: 500 }
    )
  }
}