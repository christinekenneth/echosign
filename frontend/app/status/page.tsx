'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ProgressBar from '@/components/ProgressBar';

type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

interface TimelineStep {
  step:        string;
  label:       string;
  description: string;
  completed:   boolean;
  active:      boolean;
  timestamp:   string | null;
}

interface ComplaintData {
  reference:     string;
  currentStatus: string;
  statusLabel:   string;
  timeline:      TimelineStep[];
  responses:     Array<{ message: string; respondedAt: string; respondedBy: string }>;
  submittedAt:   string;
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  received:     { bg: '#E6F1FB', text: '#0C447C' },
  under_review: { bg: '#FAEEDA', text: '#633806' },
  in_progress:  { bg: '#FAEEDA', text: '#854F0B' },
  resolved:     { bg: '#EAF3DE', text: '#27500A' },
  escalated:    { bg: '#FCEBEB', text: '#791F1F' },
};

export default function StatusPage() {
  const router = useRouter();

  const [data,    setData]    = useState<ComplaintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const refRef                = useRef<string | null>(null);

  const fetchStatus = (ref: string, isInitial = false) => {
    if (isInitial) setLoading(true);
    setError('');
    fetch(`/api/complaint/${ref}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.status === 'success') setData(json.data);
        else if (isInitial) setError(json.message || 'Could not load complaint status');
      })
      .catch(() => {
        if (isInitial) setError('Network error — please try again');
      })
      .finally(() => {
        if (isInitial) setLoading(false);
      });
  };

  useEffect(() => {
    const ref = sessionStorage.getItem('echosign_reference');
    if (!ref) {
      setError('No complaint reference found. Please submit a complaint first.');
      setLoading(false);
      return;
    }
    refRef.current = ref;
    fetchStatus(ref, true);

    const interval = setInterval(() => {
      if (refRef.current) fetchStatus(refRef.current);
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = (status: string) => {
    const s = STATUS_BADGE[status] ?? { bg: '#F3F4F6', text: '#6B7280' };
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-bold"
        style={{ background: s.bg, color: s.text }}
      >
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(10,22,40,0.08)', color: '#0A1628' }}
          >
            ← Home
          </button>
          <div className="flex-1">
            <ProgressBar current={3} total={4} />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-gray-400 animate-pulse">Loading status…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-xl p-4 bg-red-50 border border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && data && (
          <>
            {/* Reference card */}
            <div className="rounded-xl p-4 bg-[#F0FBF9] border border-[#00D4AA]">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-[#00D4AA] uppercase tracking-wider">
                  Reference number
                </p>
                {badge(data.currentStatus)}
              </div>
              <p className="font-mono font-black text-xl text-[#0A1628]">{data.reference}</p>
              <p className="text-xs text-gray-400 mt-2">
                Submitted {new Date(data.submittedAt).toLocaleString()}
              </p>
            </div>

            {/* Timeline */}
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              What is happening
            </p>
            <div className="space-y-0">
              {data.timeline.map((step, i) => (
                <div key={step.step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: step.completed ? '#00D4AA' : step.active ? '#0A1628' : '#E5E7EB',
                        color:      step.completed || step.active ? '#fff' : '#9CA3AF',
                      }}
                    >
                      {step.completed ? '✓' : i + 1}
                    </div>
                    {i < data.timeline.length - 1 && (
                      <div
                        className="w-0.5 flex-1 mt-1"
                        style={{
                          background: step.completed ? '#00D4AA' : '#E5E7EB',
                          minHeight: '1.5rem',
                        }}
                      />
                    )}
                  </div>
                  <div className="pb-5">
                    <p
                      className="text-sm font-bold leading-tight"
                      style={{ color: step.completed || step.active ? '#0A1628' : '#9CA3AF' }}
                    >
                      {step.label}
                    </p>
                    {step.timestamp && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(step.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bank response */}
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Bank response
            </p>
            {data.responses.length > 0 ? (
              data.responses.map((r, i) => (
                <div key={i} className="rounded-xl p-4 bg-white border border-gray-200">
                  <p className="text-sm text-[#0A1628]">{r.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {r.respondedBy} · {new Date(r.respondedAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl p-4 bg-white border border-gray-200">
                <p className="text-sm text-gray-400 italic">
                  No response yet — you will be notified
                </p>
              </div>
            )}
          </>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            className="w-full py-3 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-500 bg-white"
            style={{ cursor: 'default' }}
          >
            Not satisfied? Ask for a human helper
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: '#0A1628' }}
          >
            Submit another complaint
          </button>
        </div>
      </div>
    </div>
  );
}
