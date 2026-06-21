import Link from 'next/link';

export default function TopBar() {
  return (
    <nav
      className="w-full flex items-center justify-between px-4 sm:px-6 shrink-0"
      style={{ background: '#0A1628', height: 56 }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 select-none">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs leading-none"
          style={{ background: '#00D4AA', color: '#0A1628' }}
        >
          ES
        </span>
        <span className="font-black text-base tracking-tight" style={{ color: '#00D4AA' }}>
          EchoSign
        </span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-5 sm:gap-7">
        <Link href="/about"          className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">About</Link>
        <Link href="/accessibility"  className="hidden sm:block text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">Accessibility</Link>
        <Link href="/contact"        className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">Contact</Link>
      </div>
    </nav>
  );
}
