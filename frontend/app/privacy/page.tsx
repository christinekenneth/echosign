import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-10">

        <Link href="/" className="text-xs font-bold text-[#00D4AA] mb-6 inline-block">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-black text-[#0A1628] mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: June 2025</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">What we collect</h2>
            <p>
              When you use EchoSign we process the following data to deliver the service:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
              <li>Camera frames — processed in real time to detect hand and body landmarks. No video is stored.</li>
              <li>Complaint text — the transcribed or typed complaint you choose to submit.</li>
              <li>Language preference — stored locally in your browser session.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">How we use it</h2>
            <p>
              Complaint text is forwarded to the relevant financial institution for resolution.
              Landmark data from the camera is discarded after each signing session ends and is
              never stored on our servers.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">Third-party services</h2>
            <p>
              EchoSign uses MyMemory (mymemory.translated.net) for text translation. Please review
              their privacy policy for details on how translation requests are handled.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">Your rights</h2>
            <p>
              You may request deletion of any submitted complaint by contacting us with your
              reference number. Complaints are retained only for as long as needed to resolve them.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">Contact</h2>
            <p>
              For privacy questions email{' '}
              <a href="mailto:privacy@echosign.app" className="text-[#00D4AA] underline">
                privacy@echosign.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
