import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

// ─── GET /api/complaint/[reference] ──────────────────────────
// This runs when someone checks the status of their complaint
// Example: GET /api/complaint/EC-20260501-2161
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    // Get the reference number from the URL
    const { reference } = await params

    // Validate — make sure a reference was provided
    if (!reference) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Reference number is required',
        },
        { status: 400 }
      )
    }

    // ── STEP 1: FIND THE COMPLAINT ───────────────────────────
    // Look up the complaint in the database by reference number
    const { data: complaint, error } = await supabaseAdmin
      .from('complaints')
      .select('*')
      .eq('reference', reference.toUpperCase())
      .single()

    // If no complaint found return a clear error
    if (error || !complaint) {
      return NextResponse.json(
        {
          status: 'error',
          message: `No complaint found with reference ${reference}`,
        },
        { status: 404 }
      )
    }

    // ── STEP 2: GET ANY RESPONSES ────────────────────────────
    // Check if the institution has responded yet
    const { data: responses } = await supabaseAdmin
      .from('responses')
      .select('*')
      .eq('complaint_id', complaint.id)
      .order('created_at', { ascending: false })

    // ── STEP 3: BUILD THE STATUS TIMELINE ───────────────────
    // This shows the user exactly where their complaint is
    const timeline = buildTimeline(complaint.status, complaint.created_at)

    // ── STEP 4: RETURN THE FULL STATUS ──────────────────────
    return NextResponse.json({
      status: 'success',
      data: {
        reference: complaint.reference,
        currentStatus: complaint.status,
        statusLabel: getStatusLabel(complaint.status),
        issue: {
          type: complaint.issue_type,
          sector: complaint.sector,
          submittedIn: complaint.original_language,
          inputMode: complaint.input_mode,
        },
        timeline,
        responses: responses?.map((r) => ({
          message: r.response_text,
          language: r.response_language,
          respondedBy: r.responded_by,
          respondedAt: r.created_at,
        })) || [],
        submittedAt: complaint.created_at,
        lastUpdated: complaint.updated_at,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to retrieve complaint status',
        error: String(error),
      },
      { status: 500 }
    )
  }
}

// ─── UPDATE COMPLAINT STATUS ──────────────────────────────────
// PUT /api/complaint/[reference]
// Used by institution staff to update complaint status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await params
    const body = await request.json()
    const { status, responseText, responseLanguage, respondedBy } = body

    // Validate status
    const validStatuses = [
      'received',
      'under_review',
      'in_progress',
      'resolved',
      'escalated',
    ]

    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          status: 'error',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Find the complaint
    const { data: complaint, error: findError } = await supabaseAdmin
      .from('complaints')
      .select('id')
      .eq('reference', reference.toUpperCase())
      .single()

    if (findError || !complaint) {
      return NextResponse.json(
        {
          status: 'error',
          message: `No complaint found with reference ${reference}`,
        },
        { status: 404 }
      )
    }

    // Update the complaint status
    const { error: updateError } = await supabase
      .from('complaints')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', reference.toUpperCase())

    if (updateError) throw updateError

    // If a response was provided save it too
// Only save response if responseText is provided and not empty
if (responseText && responseText.trim().length > 0) {
  // Check if this exact response already exists
  const { data: existing } = await supabaseAdmin
    .from('responses')
    .select('id')
    .eq('complaint_id', complaint.id)
    .eq('response_text', responseText)
    .single()

  // Only insert if it does not already exist
  if (!existing) {
    const { error: responseError } = await supabaseAdmin
      .from('responses')
      .insert({
        complaint_id: complaint.id,
        response_text: responseText,
        response_language: responseLanguage || 'en',
        responded_by: respondedBy || 'Institution Staff',
      })

    if (responseError) throw responseError
  }
}

    return NextResponse.json({
      status: 'success',
      message: 'Complaint status updated successfully',
      data: {
        reference: reference.toUpperCase(),
        newStatus: status,
        statusLabel: getStatusLabel(status),
        hasResponse: !!responseText,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update complaint status',
        error: String(error),
      },
      { status: 500 }
    )
  }
}

// ─── HELPER: GET STATUS LABEL ────────────────────────────────
// Converts status codes into human readable labels
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    received: 'Complaint received — we have it',
    under_review: 'Under review — staff are looking into it',
    in_progress: 'In progress — we are working on it',
    resolved: 'Resolved — your complaint has been addressed',
    escalated: 'Escalated — passed to a senior team',
  }
  return labels[status] || 'Status unknown'
}

// ─── HELPER: BUILD TIMELINE ───────────────────────────────────
// Creates a visual timeline of the complaint journey
function buildTimeline(
  currentStatus: string,
  createdAt: string
): Array<{
  step: string
  label: string
  description: string
  completed: boolean
  active: boolean
  timestamp: string | null
}> {
  const steps = [
    {
      step: 'received',
      label: 'Received',
      description: 'Your complaint has been received by the institution',
    },
    {
      step: 'under_review',
      label: 'Under Review',
      description: 'A staff member is reviewing your complaint',
    },
    {
      step: 'in_progress',
      label: 'In Progress',
      description: 'The institution is actively working on your complaint',
    },
    {
      step: 'resolved',
      label: 'Resolved',
      description: 'Your complaint has been addressed',
    },
  ]

  const statusOrder = [
    'received',
    'under_review',
    'in_progress',
    'resolved',
    'escalated',
  ]
  const currentIndex = statusOrder.indexOf(currentStatus)

  return steps.map((step, index) => ({
    ...step,
    completed: index < currentIndex,
    active: step.step === currentStatus,
    timestamp: index === 0 ? createdAt : null,
  }))
}