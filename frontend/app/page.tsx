'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LanguageSelector from '@/components/LanguageSelector';

type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

const SUBTITLES: Record<Language, string> = {
  en: 'Sign or type your complaint. We handle the rest.',
  yo: 'Kọ tabi fọwọkan ẹdun rẹ. A yoo mu ohun gbogbo.',
  ha: 'Rubuta ko yi magana game da korafi. Za mu kula.',
  ig: 'Dee ma ọ bụ kọọ nsogbu gị. Anyị ga-ahụ ihe nile.',
  fr: 'Signalez ou tapez votre plainte. Nous nous chargeons du reste.',
};

const FOOTER_LINKS = [
  { label: 'About',          href: '/about'         },
  { label: 'Privacy Policy', href: '/privacy'       },
  { label: 'Terms',          href: '/terms'         },
  { label: 'Accessibility',  href: '/accessibility' },
  { label: 'Contact',        href: '/contact'       },
];

export default function WelcomePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    const lang = sessionStorage.getItem('echosign_language') as Language | null;
    if (lang) setLanguage(lang);
  }, []);

  const go = (mode: 'sign' | 'text') => {
    sessionStorage.setItem('echosign_mode', mode);
    sessionStorage.setItem('echosign_language', language);
    router.push('/record');
  };

  const handleLangChange = (lang: Language) => {
    setLanguage(lang);
    sessionStorage.setItem('echosign_language', lang);
  };

  return (
    <div className="flex-1 flex flex-col" style={{ background: '#0A1628' }}>

      {/* ── Centred hero ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-lg">

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-snug tracking-tight mb-3">
            Communicate with your bank{' '}
            <span style={{ color: '#00D4AA' }}>in your own language</span>
          </h1>
          <p className="text-white/60 text-base sm:text-lg mb-8 leading-relaxed">
            {SUBTITLES[language]}
          </p>

          {/* Language selector */}
          <div className="flex items-center gap-2.5 mb-6">
            <span className="text-white/40 text-xs font-medium">Your language</span>
            <LanguageSelector value={language} onChange={handleLangChange} />
          </div>

          {/* Mode buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => go('sign')}
              className="flex-1 py-5 rounded-2xl font-black text-base transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#00D4AA', color: '#0A1628' }}
            >
              <div className="text-3xl mb-1.5">🤟</div>
              Sign language
            </button>
            <button
              onClick={() => go('text')}
              className="flex-1 py-5 rounded-2xl font-black text-base transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                background: '#1E3A5F',
                color: '#fff',
                border: '2px solid rgba(0,212,170,0.28)',
              }}
            >
              <div className="text-3xl mb-1.5">✏️</div>
              Type it
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="px-4 pb-6 pt-2">
        <div className="max-w-lg mx-auto border-t pt-5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-3">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs hover:text-white/60 transition-colors"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>
            © 2025 EchoSign · Accessible banking for all
          </p>
        </div>
      </footer>
    </div>
  );
}
