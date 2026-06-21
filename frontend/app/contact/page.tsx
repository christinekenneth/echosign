import Link from 'next/link';

export default function ContactPage() {
  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-10">

        <Link href="/" className="text-xs font-bold text-[#00D4AA] mb-6 inline-block">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-black text-[#0A1628] mb-2">Contact</h1>
        <p className="text-sm text-gray-500 mb-8">Get in touch with the EchoSign team</p>

        <div className="space-y-4">

          <div className="rounded-xl p-5 bg-white border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">General enquiries</p>
            <a href="mailto:hello@echosign.app" className="text-sm font-bold text-[#00D4AA]">
              hello@echosign.app
            </a>
          </div>

          <div className="rounded-xl p-5 bg-white border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Accessibility &amp; support</p>
            <a href="mailto:access@echosign.app" className="text-sm font-bold text-[#00D4AA]">
              access@echosign.app
            </a>
          </div>

          <div className="rounded-xl p-5 bg-white border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Privacy &amp; data</p>
            <a href="mailto:privacy@echosign.app" className="text-sm font-bold text-[#00D4AA]">
              privacy@echosign.app
            </a>
          </div>

          <div className="rounded-xl p-5 bg-white border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Legal</p>
            <a href="mailto:legal@echosign.app" className="text-sm font-bold text-[#00D4AA]">
              legal@echosign.app
            </a>
          </div>

          <div className="rounded-xl p-5 border border-[#00D4AA] bg-[#F0FBF9]">
            <p className="text-xs font-bold text-[#00D4AA] uppercase tracking-wider mb-1">Response time</p>
            <p className="text-sm text-gray-600">
              We aim to respond to all enquiries within 2 business days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
