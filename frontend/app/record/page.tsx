'use client';

import { useState, useCallback } from 'react';
import SignCapture from '@/components/SignCapture';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
  { code: 'fr', name: 'French' },
  { code: 'ar', name: 'Arabic' },
  { code: 'es', name: 'Spanish' },
];

export default function RecordPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [language, setLanguage] = useState('en');
  const [lastConfidence, setLastConfidence] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const handleSignDetected = useCallback((phrase: string, confidence: number) => {
    setLastConfidence(confidence);
    if (confidence >= 80) {
      setComplaintText(phrase);
    }
  }, []);

  const handleSubmit = async () => {
    if (!complaintText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: complaintText,
          language,
          inputMode: 'sign',
          sector: 'finance',
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setReference(json.data.reference);
        setSubmitted(true);
        setIsRecording(false);
      } else {
        setError(json.message || 'Submission failed');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const confColor = lastConfidence >= 70 ? '#00D4AA' : lastConfidence >= 50 ? '#F5A623' : '#E8445A';

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F7F8FC' }}>
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#0A1628' }}>Complaint submitted</h1>
          <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
            Use your reference number to track progress.
          </p>
          <div
            className="rounded-xl p-4 mb-6"
            style={{ background: '#fff', border: '2px solid #00D4AA' }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#00D4AA' }}>
              Reference
            </p>
            <p className="text-xl font-mono font-bold" style={{ color: '#0A1628' }}>{reference}</p>
          </div>
          <p className="text-sm mb-6" style={{ color: '#374151' }}>{complaintText}</p>
          <button
            onClick={() => { setSubmitted(false); setComplaintText(''); setLastConfidence(0); }}
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: '#0A1628', color: '#fff' }}
          >
            Submit another complaint
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: '#F7F8FC' }}>
      <div className="w-full max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{ background: '#00D4AA', color: '#0A1628' }}
            >
              ES
            </div>
            <span className="font-bold text-lg" style={{ color: '#0A1628' }}>EchoSign</span>
          </div>

          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none"
            style={{ borderColor: '#E5E7EB', color: '#0A1628' }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <h1 className="text-xl font-bold mb-1" style={{ color: '#0A1628' }}>
          Sign your complaint
        </h1>
        <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
          Show your sign in the camera. When confidence reaches 80% your complaint will be filled in automatically.
        </p>

        {/* Camera + skeleton + confidence bar + result */}
        <SignCapture
          isRecording={isRecording}
          targetLanguage={language}
          onSignDetected={handleSignDetected}
        />

        {/* Record toggle */}
        <button
          onClick={() => setIsRecording((r) => !r)}
          className="w-full py-3 rounded-xl font-bold text-sm mt-4 transition-colors"
          style={isRecording
            ? { background: '#E8445A', color: '#fff' }
            : { background: '#00D4AA', color: '#0A1628' }
          }
        >
          {isRecording ? '■  Stop signing' : '●  Start signing'}
        </button>

        {/* Confidence hint */}
        {isRecording && lastConfidence > 0 && lastConfidence < 80 && (
          <p className="text-xs text-center mt-2" style={{ color: confColor }}>
            Confidence {lastConfidence}% — keep signing until it reaches 80%
          </p>
        )}
        {isRecording && lastConfidence >= 80 && (
          <p className="text-xs text-center mt-2" style={{ color: '#00D4AA' }}>
            Great sign! Complaint text filled in below.
          </p>
        )}

        {/* Editable complaint text */}
        <div className="mt-4">
          <label
            className="text-xs font-bold uppercase tracking-wider block mb-1"
            style={{ color: '#0A1628' }}
          >
            Complaint
          </label>
          <textarea
            value={complaintText}
            onChange={(e) => setComplaintText(e.target.value)}
            placeholder="Sign to auto-fill, or type your complaint here…"
            rows={4}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none transition-colors"
            style={{
              border: `2px solid ${complaintText ? '#00D4AA' : '#E5E7EB'}`,
              color: '#0A1628',
            }}
          />
        </div>

        {error && (
          <p className="text-xs mt-2" style={{ color: '#E8445A' }}>{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!complaintText.trim() || submitting}
          className="w-full py-3 rounded-xl font-bold text-sm mt-3 transition-opacity"
          style={{
            background: '#0A1628',
            color: '#fff',
            opacity: !complaintText.trim() || submitting ? 0.4 : 1,
          }}
        >
          {submitting ? 'Submitting…' : 'Submit complaint →'}
        </button>
      </div>
    </div>
  );
}
