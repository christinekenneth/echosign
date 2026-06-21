'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────

type NavItem = 'all' | 'resolved' | 'escalated' | 'settings';
type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

interface ComplaintRow {
  id:          string;
  reference:   string;
  issueType:   string;
  issueLabel:  string;
  sector:      string;
  language:    string;
  text:        string;
  englishText: string;
  status:      string;
  inputMode:   string;
  submittedAt: string;
  updatedAt:   string;
}

interface TimelineStep {
  step:        string;
  label:       string;
  description: string;
  completed:   boolean;
  active:      boolean;
  timestamp:   string | null;
}

interface ComplaintDetail {
  reference:     string;
  currentStatus: string;
  statusLabel:   string;
  issue:         { type: string; sector: string; submittedIn: string; inputMode: string };
  timeline:      TimelineStep[];
  responses:     Array<{ message: string; respondedBy: string; respondedAt: string }>;
  submittedAt:   string;
}

// ── Constants ─────────────────────────────────────────────────

const VALID_STATUSES = [
  { value: 'received',     label: 'Received'     },
  { value: 'under_review', label: 'Under Review' },
  { value: 'in_progress',  label: 'In Progress'  },
  { value: 'resolved',     label: 'Resolved'     },
  { value: 'escalated',    label: 'Escalated'    },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'yo', label: 'Yoruba'  },
  { value: 'ha', label: 'Hausa'   },
  { value: 'ig', label: 'Igbo'    },
  { value: 'fr', label: 'French'  },
];

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  received:     { bg: '#E6F1FB', text: '#0C447C' },
  under_review: { bg: '#FAEEDA', text: '#633806' },
  in_progress:  { bg: '#FAEEDA', text: '#854F0B' },
  resolved:     { bg: '#EAF3DE', text: '#27500A' },
  escalated:    { bg: '#FCEBEB', text: '#791F1F' },
};

const NAV_ITEMS: { id: NavItem; label: string }[] = [
  { id: 'all',       label: 'All Complaints' },
  { id: 'resolved',  label: 'Resolved'       },
  { id: 'escalated', label: 'Escalated'      },
  { id: 'settings',  label: 'Settings'       },
];

// ── Component ─────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  const [activeNav, setActiveNav]         = useState<NavItem>('all');
  const [complaints, setComplaints]       = useState<ComplaintRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');

  // Side panel
  const [panelOpen, setPanelOpen]         = useState(false);
  const [detail, setDetail]               = useState<ComplaintDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedRow, setSelectedRow]     = useState<ComplaintRow | null>(null);

  // Form
  const [formStatus, setFormStatus]       = useState('');
  const [responseText, setResponseText]   = useState('');
  const [responseLang, setResponseLang]   = useState<Language>('en');
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState('');
  const [submitOk, setSubmitOk]           = useState(false);

  // ── Fetch list ──────────────────────────────────────────────

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/complaint?list=true');
      const json = await res.json();
      if (json.status === 'success') setComplaints(json.data.complaints);
      else setError(json.message || 'Failed to load complaints');
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  // ── Computed ────────────────────────────────────────────────

  const stats = {
    total:      complaints.length,
    pending:    complaints.filter((c) => c.status === 'received' || c.status === 'under_review').length,
    inProgress: complaints.filter((c) => c.status === 'in_progress').length,
    resolved:   complaints.filter((c) => c.status === 'resolved').length,
  };

  const filtered = activeNav === 'all'
    ? complaints
    : activeNav === 'settings'
    ? []
    : complaints.filter((c) => c.status === activeNav);

  // ── Open detail panel ───────────────────────────────────────

  const openPanel = async (row: ComplaintRow) => {
    setSelectedRow(row);
    setDetail(null);
    setDetailLoading(true);
    setPanelOpen(true);
    setFormStatus(row.status);
    setResponseText('');
    setResponseLang('en');
    setSubmitError('');
    setSubmitOk(false);

    try {
      const res  = await fetch(`/api/complaint/${row.reference}`);
      const json = await res.json();
      if (json.status === 'success') setDetail(json.data);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Submit update ───────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedRow || !formStatus) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitOk(false);
    try {
      const res = await fetch(`/api/complaint/${selectedRow.reference}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:           formStatus,
          responseText:     responseText.trim() || undefined,
          responseLanguage: responseLang,
          respondedBy:      'Admin',
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSubmitOk(true);
        await fetchComplaints();
        setTimeout(() => { setPanelOpen(false); setSubmitOk(false); }, 1200);
      } else {
        setSubmitError(json.message || 'Failed to update');
      }
    } catch {
      setSubmitError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────

  const badge = (status: string) => {
    const s = STATUS_BADGE[status] ?? { bg: '#F3F4F6', text: '#6B7280' };
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-semibold"
        style={{ background: s.bg, color: s.text }}
      >
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans">

      {/* ── SIDEBAR ── */}
      <aside
        className="flex flex-col flex-shrink-0"
        style={{ width: 200, background: '#0A1628', minHeight: '100vh' }}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/10">
          <p className="text-[#00D4AA] font-black text-lg tracking-tight">EchoSign</p>
          <p className="text-white/40 text-xs mt-0.5">Admin dashboard</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className="text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? 'rgba(0,212,170,0.12)' : 'transparent',
                  color:      active ? '#00D4AA' : 'rgba(255,255,255,0.55)',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Train model */}
        <div className="px-3 pt-2 border-t border-white/10 mt-2">
          <button
            onClick={() => router.push('/admin/train')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: '#00D4AA', background: 'rgba(0,212,170,0.08)' }}
          >
            Train my signing
          </button>
        </div>

        {/* Back to app */}
        <div className="mt-auto px-3 pb-6">
          <button
            onClick={() => router.push('/welcome')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            ← Back to app
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-4">
          <div>
            <h1 className="text-2xl font-black text-[#0A1628]">Complaint dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review and respond to complaints from DHH users
            </p>
          </div>
          <button
            onClick={fetchComplaints}
            className="px-4 py-2 rounded-lg text-sm font-bold border-2 border-[#0A1628] text-[#0A1628] bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 px-8 mb-6">
          {[
            { label: 'Total complaints', value: stats.total },
            { label: 'Pending review',   value: stats.pending    },
            { label: 'In progress',      value: stats.inProgress },
            { label: 'Resolved',         value: stats.resolved   },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-3xl font-black text-[#0A1628]">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Settings placeholder */}
        {activeNav === 'settings' && (
          <div className="px-8">
            <div className="bg-white rounded-xl p-10 text-center text-gray-400 text-sm shadow-sm">
              Settings coming soon
            </div>
          </div>
        )}

        {/* Table */}
        {activeNav !== 'settings' && (
          <div className="px-8 pb-8">
            {loading && (
              <div className="bg-white rounded-xl p-10 text-center text-gray-400 text-sm shadow-sm animate-pulse">
                Loading complaints…
              </div>
            )}
            {!loading && error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
                {error}
              </div>
            )}
            {!loading && !error && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Reference', 'Issue type', 'Language', 'Status', 'Submitted', 'Action'].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                          No complaints found
                        </td>
                      </tr>
                    ) : (
                      filtered.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-5 py-3 font-mono font-bold text-[#0A1628]">{c.reference}</td>
                          <td className="px-5 py-3 text-gray-700">{c.issueLabel}</td>
                          <td className="px-5 py-3 text-gray-500 uppercase">{c.language}</td>
                          <td className="px-5 py-3">{badge(c.status)}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs">
                            {new Date(c.submittedAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => openPanel(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0A1628] text-white hover:opacity-80"
                            >
                              View and respond
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── SIDE PANEL OVERLAY ── */}
      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* ── SIDE PANEL ── */}
      <div
        className="fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden transition-transform duration-300"
        style={{
          width: 380,
          transform: panelOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="font-black text-[#0A1628] text-sm">Complaint details</p>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {detailLoading && (
            <p className="text-sm text-gray-400 animate-pulse text-center py-10">Loading…</p>
          )}

          {!detailLoading && selectedRow && (
            <>
              {/* Reference + meta */}
              <div className="rounded-xl p-4 bg-[#F0FBF9] border border-[#00D4AA]">
                <p className="text-xs font-bold text-[#00D4AA] uppercase tracking-wider mb-1">
                  Reference number
                </p>
                <p className="font-mono font-black text-lg text-[#0A1628]">{selectedRow.reference}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Issue:</span> {selectedRow.issueLabel}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Sector:</span> {selectedRow.sector}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Language:</span>{' '}
                    {LANGUAGES.find((l) => l.value === selectedRow.language)?.label ?? selectedRow.language}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Input:</span> {selectedRow.inputMode}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Submitted:</span>{' '}
                    {new Date(selectedRow.submittedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Original complaint text */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Original complaint
                </p>
                <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
                  {selectedRow.text}
                </div>
                {selectedRow.language !== 'en' && selectedRow.englishText && (
                  <div className="bg-blue-50 rounded-xl p-3 text-sm text-gray-600 leading-relaxed mt-2">
                    <p className="text-xs text-blue-400 font-semibold mb-1">English translation</p>
                    {selectedRow.englishText}
                  </div>
                )}
              </div>

              {/* Timeline */}
              {detail?.timeline && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Status timeline
                  </p>
                  <div className="space-y-0">
                    {detail.timeline.map((step, i) => (
                      <div key={step.step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              background: step.completed ? '#00D4AA' : step.active ? '#0A1628' : '#E5E7EB',
                              color:      step.completed || step.active ? '#fff' : '#9CA3AF',
                            }}
                          >
                            {step.completed ? '✓' : i + 1}
                          </div>
                          {i < detail.timeline.length - 1 && (
                            <div
                              className="w-0.5 flex-1 mt-1"
                              style={{ background: step.completed ? '#00D4AA' : '#E5E7EB', minHeight: '1.25rem' }}
                            />
                          )}
                        </div>
                        <div className="pb-3">
                          <p
                            className="text-xs font-bold"
                            style={{ color: step.completed || step.active ? '#0A1628' : '#9CA3AF' }}
                          >
                            {step.label}
                          </p>
                          {step.timestamp && (
                            <p className="text-xs text-gray-400">
                              {new Date(step.timestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Previous responses */}
              {detail?.responses && detail.responses.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Previous responses
                  </p>
                  {detail.responses.map((r, i) => (
                    <div key={i} className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2">
                      <p className="text-sm text-[#0A1628]">{r.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {r.respondedBy} · {new Date(r.respondedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RESPONSE FORM ── */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 flex-shrink-0 bg-white">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Update status &amp; respond
          </p>

          {/* Status dropdown */}
          <select
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] focus:outline-none focus:border-[#00D4AA]"
          >
            <option value="">Select new status…</option>
            {VALID_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Response text */}
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Type your response here…"
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] placeholder-gray-400 focus:outline-none focus:border-[#00D4AA] resize-none"
          />

          {/* Language selector */}
          <select
            value={responseLang}
            onChange={(e) => setResponseLang(e.target.value as Language)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] focus:outline-none focus:border-[#00D4AA]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {submitError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{submitError}</p>
          )}

          {submitOk && (
            <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg font-semibold">
              Updated successfully ✓
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!formStatus || submitting}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-colors"
            style={{
              background: formStatus && !submitting ? '#0A1628' : '#E5E7EB',
              color:      formStatus && !submitting ? '#fff'    : '#9CA3AF',
            }}
          >
            {submitting ? 'Sending…' : 'Send response'}
          </button>
        </div>
      </div>
    </div>
  );
}
