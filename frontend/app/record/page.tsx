'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SignCapture from '@/components/SignCapture';
import AvatarMirror, { type PoseFrame } from '@/components/AvatarMirror';
import ProgressBar from '@/components/ProgressBar';
import LanguageSelector from '@/components/LanguageSelector';

type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';
type ToLang   = 'en' | 'yo' | 'ha' | 'ig' | 'fr' | 'ar' | 'sw' | 'pt' | 'es' | 'de';

const MAX_BUFFER = 300;
const MAX_CHARS  = 500;

const ALL_TO_LANGS: { code: ToLang; name: string }[] = [
  { code: 'en', name: 'English'    },
  { code: 'yo', name: 'Yoruba'     },
  { code: 'ha', name: 'Hausa'      },
  { code: 'ig', name: 'Igbo'       },
  { code: 'fr', name: 'French'     },
  { code: 'ar', name: 'Arabic'     },
  { code: 'sw', name: 'Swahili'    },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish'    },
  { code: 'de', name: 'German'     },
];

const FROM_LABELS: Record<Language, string> = {
  en: 'English', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', fr: 'French',
};

// ── Root ──────────────────────────────────────────────────────────────────
export default function RecordPage() {
  const router = useRouter();
  const [mode, setMode]     = useState<'sign' | 'text' | null>(null);
  const [language, setLang] = useState<Language>('en');

  useEffect(() => {
    const m    = sessionStorage.getItem('echosign_mode');
    const lang = sessionStorage.getItem('echosign_language') as Language | null;
    setMode(m === 'text' ? 'text' : 'sign');
    if (lang) setLang(lang);
  }, []);

  const handleLangChange = (lang: Language) => {
    setLang(lang);
    sessionStorage.setItem('echosign_language', lang);
  };

  if (!mode) {
    return <div className="flex-1" style={{ background: '#0A1628' }} />;
  }

  return mode === 'sign'
    ? <SignView  language={language} onLangChange={handleLangChange} router={router} />
    : <TextView language={language} onLangChange={handleLangChange} router={router} />;
}

// ── Shared props ──────────────────────────────────────────────────────────
type ViewProps = {
  language:     Language;
  onLangChange: (l: Language) => void;
  router:       ReturnType<typeof useRouter>;
};

// ── Sign View ─────────────────────────────────────────────────────────────
function SignView({ language, onLangChange, router }: ViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isRecording,   setIsRecording]   = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [confidence,    setConfidence]    = useState(0);
  const [handsVisible,  setHandsVisible]  = useState(0);
  const [isEditMode,    setIsEditMode]    = useState(false);
  const [poseBuffer,    setPoseBuffer]    = useState<PoseFrame[]>([]);

  const livePoseRef    = useRef<any>(null);
  const poseBufferRef  = useRef<PoseFrame[]>([]);
  const isRecordingRef = useRef(false);
  const isEditModeRef  = useRef(false);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isEditModeRef.current  = isEditMode;  }, [isEditMode]);

  const getFrame = useCallback(() => livePoseRef.current, []);

  const handlePoseResults = useCallback((results: any) => {
    livePoseRef.current = results;
    if (isRecordingRef.current) {
      const buf = poseBufferRef.current;
      if (buf.length >= MAX_BUFFER) buf.shift();
      buf.push({ results, timestamp: performance.now() });
    }
  }, []);

  const handleSignDetected = useCallback((phrase: string, conf: number) => {
    setConfidence(conf);
    if (!isEditModeRef.current) setComplaintText(phrase);
  }, []);

  const handleStopSigning = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setPoseBuffer([...poseBufferRef.current]);
  };

  const handleStartSigning = () => {
    setIsRecording(true);
    isRecordingRef.current = true;
    setIsEditMode(false);
    isEditModeRef.current = false;
    setComplaintText('');
    setConfidence(0);
    setHandsVisible(0);
    poseBufferRef.current = [];
    setPoseBuffer([]);
  };

  const handleConfirmYes = useCallback(() => {
    const text = complaintText.trim();
    if (!text) return;
    sessionStorage.setItem('echosign_complaint', text);
    sessionStorage.setItem('echosign_confidence', String(confidence));
    router.push('/confirm');
  }, [complaintText, confidence, router]);

  const handleEditText = useCallback(() => {
    setIsEditMode(true);
    isEditModeRef.current = true;
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 50);
  }, []);

  const cameraBorder =
    isRecording
      ? handsVisible > 0 ? '#00D4AA' : '#F5A623'
      : '#1E3A5F';

  const confColor =
    confidence >= 70 ? '#00D4AA' :
    confidence >= 40 ? '#F5A623' : '#E8445A';

  const hasText = complaintText.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col" style={{ background: '#F9FAFB' }}>

      {/* ── Navy camera band ─────────────────────────────── */}
      <div style={{ background: '#0A1628' }}>
        <div className="max-w-2xl mx-auto">

          {/* Camera + Avatar — stacked on mobile, side-by-side on sm+ */}
          <div className="flex flex-col sm:flex-row">
            {/* Camera — full-width on mobile, half on sm+ */}
            <div
              className="relative overflow-hidden transition-all sm:flex-1"
              style={{
                height: 'clamp(260px, 67vw, 300px)',
                borderRight:  '1px solid #1E3A5F',
                borderBottom: `3px solid ${cameraBorder}`,
              }}
            >
              <SignCapture
                isRecording={isRecording}
                targetLanguage={language}
                onSignDetected={handleSignDetected}
                onHandsDetected={setHandsVisible}
                onPoseResults={handlePoseResults}
                compact
              />
              <div
                className="absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
              >
                You
              </div>
              {isRecording && (
                <div
                  className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: '#00D4AA', color: '#0A1628' }}
                >
                  ● REC
                </div>
              )}
            </div>

            {/* Avatar — stacks below camera on mobile, side-by-side on sm+ */}
            <div className="flex-1 sm:flex-1 relative overflow-hidden" style={{ minHeight: 'clamp(200px, 55vw, 300px)' }}>
              <AvatarMirror
                getFrame={getFrame}
                poseBuffer={poseBuffer}
                isRecording={isRecording}
                onRedo={handleStartSigning}
              />
              <div
                className="absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full z-10"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#00D4AA' }}
              >
                Echo
              </div>
            </div>
          </div>

          {/* Hands tip — slides in when hands not visible */}
          <div
            className="overflow-hidden transition-all duration-300"
            style={{ maxHeight: isRecording && handsVisible === 0 ? 36 : 0 }}
          >
            <p
              className="text-xs text-center py-2 px-4 font-medium"
              style={{ color: '#F5A623' }}
            >
              ✋ Raise your hands into the camera frame to begin
            </p>
          </div>

          {/* Start / Stop */}
          <div className="px-4 pt-2 pb-3">
            <button
              onClick={isRecording ? handleStopSigning : handleStartSigning}
              className="w-full py-2.5 rounded-xl font-bold text-sm transition-colors"
              style={
                isRecording
                  ? { background: '#E8445A', color: '#fff' }
                  : { background: '#00D4AA', color: '#0A1628' }
              }
            >
              {isRecording ? '■  Stop signing' : '●  Start signing'}
            </button>
          </div>
        </div>
      </div>

      {/* ── White content area ────────────────────────────── */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-3">

        {/* Progress + language selector */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar current={1} total={4} />
          </div>
          <div className="shrink-0">
            <LanguageSelector value={language} onChange={onLangChange} />
          </div>
        </div>

        {/* What I understand */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-[#0A1628] uppercase tracking-wider">
              Translation
            </p>
            <span className="text-xs text-gray-400">Live captions</span>
          </div>

          <textarea
            ref={textareaRef}
            value={complaintText}
            onChange={(e) => setComplaintText(e.target.value)}
            readOnly={!isEditMode}
            placeholder={
              isRecording
                ? 'Signs appear here in real time…'
                : 'No text captured yet'
            }
            rows={3}
            className="w-full text-sm resize-none focus:outline-none text-[#0A1628] placeholder-gray-400"
            style={{ cursor: isEditMode ? 'text' : 'default' }}
          />

          {isRecording && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Confidence</span>
                <span style={{ color: confidence > 0 ? confColor : '#9CA3AF' }}>
                  {confidence > 0 ? `${confidence}%` : '—'}
                  {confidence > 0 && confidence < 70 && (
                    <span className="ml-1 font-bold" style={{ color: '#F5A623' }}>
                      ⚠ low
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${confidence}%`, background: confColor }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleStartSigning}
            className="flex-1 py-3 rounded-xl font-bold text-xs"
            style={{ border: '2px solid #0A1628', color: '#0A1628', background: 'transparent' }}
          >
            Sign again
          </button>
          <button
            onClick={handleConfirmYes}
            disabled={!hasText}
            className="flex-1 py-3 rounded-xl font-bold text-xs transition-colors"
            style={{
              background: hasText ? '#0A1628' : '#E5E7EB',
              color:      hasText ? '#fff'    : '#9CA3AF',
            }}
          >
            Yes, send it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Text View ─────────────────────────────────────────────────────────────
function TextView({ language, onLangChange, router }: ViewProps) {
  const [toLang,         setToLang]         = useState<ToLang>('en');
  const [text,           setText]           = useState('');
  const [translating,    setTranslating]    = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [preview,        setPreview]        = useState('');
  const [confidence,     setConfidence]     = useState(0);

  const handleToLangChange = (lang: ToLang) => {
    setToLang(lang);
    setPreview('');
    setConfidence(0);
    setTranslateError('');
  };

  const handleTranslate = async () => {
    if (!text.trim() || translating) return;
    if (language === toLang) {
      setPreview(text.trim());
      setConfidence(100);
      return;
    }
    setTranslating(true);
    setTranslateError('');
    setPreview('');
    setConfidence(0);
    try {
      const res  = await fetch('/api/translate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:         text.trim(),
          fromLanguage: language,
          toLanguage:   toLang,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        const translated = json.data.translatedText as string;
        if (translated.trim().toLowerCase() === text.trim().toLowerCase()) {
          setTranslateError(
            'Translation service returned unchanged text. Try a shorter sentence or check the language selection.',
          );
        } else {
          setPreview(translated);
          setConfidence(json.data.confidence);
        }
      } else {
        setTranslateError(json.message || 'Translation failed — please try again');
      }
    } catch {
      setTranslateError('Network error — please try again');
    } finally {
      setTranslating(false);
    }
  };

  const handleContinue = () => {
    if (!text.trim()) return;
    sessionStorage.setItem('echosign_complaint', preview || text.trim());
    sessionStorage.setItem('echosign_confidence', String(confidence));
    router.push('/confirm');
  };

  const confColor    = confidence >= 70 ? '#00D4AA' : confidence >= 40 ? '#F5A623' : '#E8445A';
  const canContinue  = text.trim().length > 0;
  const canTranslate = text.trim().length >= 5 && !translating;
  const sameLanguage = (language as string) === (toLang as string);

  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">

        {/* Back + Progress + language */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="shrink-0 text-sm font-bold px-2 py-1 rounded-lg"
            style={{ color: '#0A1628', background: 'rgba(10,22,40,0.08)' }}
          >
            ←
          </button>
          <div className="flex-1">
            <ProgressBar current={1} total={4} />
          </div>
          <div className="shrink-0">
            <LanguageSelector value={language} onChange={onLangChange} />
          </div>
        </div>

        {/* From → To row */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">From</p>
            <span
              className="inline-block text-xs px-3 py-1.5 rounded-full font-bold"
              style={{ background: '#F0FBF9', color: '#00D4AA', border: '1px solid #00D4AA' }}
            >
              {FROM_LABELS[language]}
            </span>
          </div>
          <span className="text-gray-300 text-base mb-1.5">→</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">To</p>
            <select
              value={toLang}
              onChange={(e) => handleToLangChange(e.target.value as ToLang)}
              className="text-xs px-3 py-1.5 rounded-full font-bold outline-none cursor-pointer"
              style={{ background: '#F0FBF9', color: '#00D4AA', border: '1px solid #00D4AA' }}
            >
              {ALL_TO_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Textarea */}
        <div className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden focus-within:border-[#00D4AA] transition-colors">
          <textarea
            value={text}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setText(e.target.value);
                if (preview) { setPreview(''); setConfidence(0); }
              }
            }}
            placeholder="Describe your problem here…"
            rows={5}
            className="w-full px-4 pt-4 pb-2 text-sm text-[#0A1628] placeholder-gray-400 resize-none focus:outline-none"
          />
          <div className="flex justify-end px-4 pb-3">
            <span
              className="text-xs"
              style={{ color: text.length > MAX_CHARS * 0.9 ? '#E8445A' : '#9CA3AF' }}
            >
              {text.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* Translate button */}
        <button
          onClick={handleTranslate}
          disabled={!canTranslate}
          className="w-full py-3 rounded-xl font-bold text-sm transition-colors"
          style={{
            background: canTranslate ? '#00D4AA' : '#E5E7EB',
            color:      canTranslate ? '#0A1628' : '#9CA3AF',
          }}
        >
          {translating
            ? 'Translating…'
            : sameLanguage
            ? 'No translation needed'
            : `Translate to ${ALL_TO_LANGS.find((l) => l.code === toLang)?.name ?? toLang} →`}
        </button>

        {translateError && (
          <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">
            {translateError}
          </p>
        )}

        {preview && (
          <div className="rounded-xl p-4 bg-[#F0FBF9] border border-[#00D4AA]">
            <p className="text-xs font-bold text-[#00D4AA] uppercase tracking-wider mb-2">
              {sameLanguage ? 'Your text' : 'Translation'}
            </p>
            <p className="text-sm text-[#0A1628] leading-relaxed">{preview}</p>
            {!sameLanguage && (
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
              Check this looks right before continuing
            </p>
          </div>
        )}

        {canContinue && (
          <button
            onClick={handleContinue}
            className="w-full py-3 rounded-xl font-bold text-sm bg-[#0A1628] text-white"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
