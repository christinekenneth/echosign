'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProgressBar from '@/components/ProgressBar';

type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

export default function ConfirmPage() {
  const router = useRouter();

  const [complaintText, setComplaintText] = useState('');
  const [confidence,    setConfidence]    = useState(0);
  const [language,      setLanguage]      = useState<Language>('en');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    const text = sessionStorage.getItem('echosign_complaint');
    if (text) setComplaintText(text);

    const conf = sessionStorage.getItem('echosign_confidence');
    if (conf) setConfidence(Number(conf));

    const lang = sessionStorage.getItem('echosign_language') as Language | null;
    if (lang) setLanguage(lang);
  }, []);

  const handleSend = async () => {
    if (loading || !complaintText) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/complaint', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:      complaintText,
          language,
          inputMode: sessionStorage.getItem('echosign_mode') || 'sign',
          sector:    'finance',
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        sessionStorage.setItem('echosign_reference', json.data.reference);
        router.push('/status');
      } else {
        setError(json.message || 'Failed to submit — please try again');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const confColor =
    confidence >= 70 ? '#00D4AA' :
    confidence >= 40 ? '#F5A623' : '#E8445A';

  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Progress + back + home */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(10,22,40,0.08)', color: '#0A1628' }}
          >
            ← Home
          </button>
          <div className="flex-1">
            <ProgressBar current={2} total={4} />
          </div>
          <button
            onClick={() => router.push('/record')}
            className="shrink-0 text-xs font-bold text-gray-400 hover:text-gray-600"
          >
            ← Back
          </button>
        </div>

        <h2 className="text-xl font-black text-[#0A1628]">Review your complaint</h2>

        {/* Teal review card */}
        <div className="rounded-xl p-4 bg-[#F0FBF9] border border-[#00D4AA]">
          <p className="text-xs font-bold text-[#00D4AA] uppercase tracking-wider mb-2">
            What I understood
          </p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {complaintText || (
              <span className="text-gray-400 italic">
                No complaint text — go back and try again.
              </span>
            )}
          </p>
          {confidence > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Confidence</span>
                <span style={{ color: confColor }}>{confidence}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${confidence}%`, background: confColor }}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3 border-t border-[#00D4AA]/20 pt-2">
            Check this is correct before sending
          </p>
        </div>

        {error && (
          <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Is this correct?
        </p>

        {/* Yes / No buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/record')}
            className="flex-1 py-4 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-600 bg-white"
          >
            No, redo it
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !complaintText}
            className="flex-1 py-4 rounded-xl font-bold text-sm transition-colors"
            style={{
              background: loading || !complaintText ? '#E5E7EB' : '#0A1628',
              color:      loading || !complaintText ? '#9CA3AF' : '#fff',
            }}
          >
            {loading ? 'Sending…' : 'Yes, send it'}
          </button>
        </div>

        <button
          className="w-full py-3 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-500 bg-white"
          style={{ cursor: 'default' }}
        >
          Need a human interpreter?
        </button>
      </div>
    </div>
  );
}
