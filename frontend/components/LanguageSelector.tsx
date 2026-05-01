type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

interface LanguageSelectorProps {
  value: Language;
  onChange: (lang: Language) => void;
}

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-opacity-20 bg-[#00D4AA]">
      <svg className="w-3 h-3 text-[#00D4AA]" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
        <path d="M6 1c-1.2 1.8-1.2 7.2 0 10M6 1c1.2 1.8 1.2 7.2 0 10M1 6h10" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        className="bg-transparent text-[#00D4AA] text-xs outline-none font-semibold cursor-pointer"
      >
        <option value="en">EN</option>
        <option value="yo">YO</option>
        <option value="ha">HA</option>
        <option value="ig">IG</option>
        <option value="fr">FR</option>
      </select>
    </div>
  );
}
