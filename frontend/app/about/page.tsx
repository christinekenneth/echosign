import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-10">

        <Link href="/" className="text-xs font-bold text-[#00D4AA] mb-6 inline-block">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-black text-[#0A1628] mb-2">About EchoSign</h1>
        <p className="text-sm text-gray-500 mb-8">Accessible banking for everyone</p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <p>
            EchoSign is an accessibility platform that enables people who use sign language or
            minority languages to communicate complaints and queries directly to their bank —
            without needing an interpreter.
          </p>
          <p>
            Users can either sign their complaint through their device camera (EchoSign reads the
            signs in real time and converts them to text) or type in any of our supported
            languages, which are then translated automatically before submission.
          </p>
          <p>
            Submitted complaints are tracked end-to-end: users receive a reference number and can
            check the status of their complaint at any time.
          </p>

          <div className="rounded-xl p-5 border border-[#00D4AA] bg-[#F0FBF9]">
            <p className="font-bold text-[#0A1628] mb-1">Supported languages</p>
            <p className="text-gray-600">
              English · Yoruba · Hausa · Igbo · French · Arabic · Swahili · Portuguese · Spanish · German
            </p>
          </div>

          <div className="rounded-xl p-5 border border-gray-200 bg-white">
            <p className="font-bold text-[#0A1628] mb-1">Built for</p>
            <p className="text-gray-600">
              Deaf and hard-of-hearing bank customers · Non-English speakers ·
              Anyone who finds written formal language difficult
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
