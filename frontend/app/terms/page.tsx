import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-10">

        <Link href="/" className="text-xs font-bold text-[#00D4AA] mb-6 inline-block">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-black text-[#0A1628] mb-2">Terms of Service</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: June 2025</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">1. Service description</h2>
            <p>
              EchoSign provides a sign-language and multilingual interface for submitting
              complaints to financial institutions. We facilitate communication — we are not
              responsible for the outcome of any complaint or for decisions made by the institution.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">2. Accuracy of transcription</h2>
            <p>
              Sign recognition and translation are provided on a best-effort basis. You are
              responsible for reviewing the transcribed complaint text before submitting it. EchoSign
              is not liable for errors arising from inaccurate sign recognition or translation.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">3. Acceptable use</h2>
            <p>
              You agree not to submit false, misleading, or abusive complaints through this
              service. The service is intended solely for legitimate customer complaints.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">4. Changes to the service</h2>
            <p>
              EchoSign may update or discontinue features at any time. We will endeavour to
              give reasonable notice of material changes.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">5. Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:legal@echosign.app" className="text-[#00D4AA] underline">
                legal@echosign.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
