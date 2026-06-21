type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

interface LanguageSelectorProps {
  value: Language;
  onChange: (lang: Language) => void;
}

const LABELS: Record<Language, string> = {
  en: 'English',
  yo: 'Yoruba',
  ha: 'Hausa',
  ig: 'Igbo',
  fr: 'French',
};

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{ border: '1px solid rgba(0,212,170,0.35)', background: 'rgba(0,212,170,0.08)' }}
    >
      {/* Globe icon */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 12 12" fill="none" style={{ color: '#00D4AA' }}>
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
        <path d="M6 1c-1.2 1.8-1.2 7.2 0 10M6 1c1.2 1.8 1.2 7.2 0 10M1 6h10" stroke="currentColor" strokeWidth="0.8" />
      </svg>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        className="bg-transparent text-xs font-semibold outline-none cursor-pointer"
        style={{ color: '#00D4AA' }}
      >
        {(Object.entries(LABELS) as [Language, string][]).map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </div>
  );
}
