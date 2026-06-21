'use client';

import type { ReactNode } from 'react';
import EchoAvatar from '@/components/EchoAvatar';
import LanguageSelector from '@/components/LanguageSelector';

type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

interface PageShellProps {
  title: string;
  onBack?: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  isSigning: boolean;
  bubble: string;
  onReplay?: () => void;
  children: ReactNode;
}

export default function PageShell({
  title,
  onBack,
  language,
  onLanguageChange,
  isSigning,
  bubble,
  onReplay = () => {},
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Centred phone-width column */}
      <div className="w-full max-w-[430px] mx-auto flex flex-col min-h-screen shadow-2xl">

        {/* ── HEADER ── */}
        <header className="flex items-center gap-3 px-4 py-3 bg-[#0A1628]">
          {onBack ? (
            <button
              onClick={onBack}
              aria-label="Back"
              className="w-8 h-8 flex items-center justify-center text-white rounded-full hover:bg-white/10 text-xl leading-none flex-shrink-0"
            >
              ←
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#00D4AA] flex items-center justify-center font-bold text-[#0A1628] text-xs flex-shrink-0">
              ES
            </div>
          )}
          <span className="flex-1 text-white font-bold text-sm truncate">{title}</span>
          <LanguageSelector value={language} onChange={onLanguageChange} />
        </header>

        {/* ── AVATAR ZONE ── */}
        <EchoAvatar isSigning={isSigning} bubble={bubble} onReplay={onReplay} />

        {/* ── WHITE CONTENT AREA ── */}
        <div className="relative z-10 flex-1 bg-white rounded-t-3xl -mt-2 flex flex-col overflow-hidden">
          <div className="flex-1 px-4 py-5 flex flex-col gap-3 overflow-y-auto">
            {children}
          </div>
        </div>

      </div>
    </div>
  );
}
