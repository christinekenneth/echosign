import Link from 'next/link';

export default function AccessibilityPage() {
  return (
    <div className="flex-1" style={{ background: '#F9FAFB' }}>
      <div className="max-w-2xl mx-auto px-4 py-10">

        <Link href="/" className="text-xs font-bold text-[#00D4AA] mb-6 inline-block">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-black text-[#0A1628] mb-2">Accessibility Statement</h1>
        <p className="text-xs text-gray-400 mb-8">EchoSign is built for everyone</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <div className="rounded-xl p-5 border border-[#00D4AA] bg-[#F0FBF9]">
            <p className="font-bold text-[#0A1628] mb-1">Our commitment</p>
            <p className="text-gray-600">
              EchoSign exists because financial services are inaccessible to millions of people who
              use sign language or non-dominant languages. Accessibility is not a feature — it is
              the entire purpose of this product.
            </p>
          </div>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">What we support</h2>
            <ul className="space-y-2 list-disc list-inside text-gray-600">
              <li>Sign language input via device camera (no specialist hardware needed)</li>
              <li>Text input with automatic translation across 10 languages</li>
              <li>High-contrast colour scheme throughout</li>
              <li>Responsive layout for mobile and desktop</li>
              <li>Screen-reader friendly semantic HTML and ARIA labels</li>
              <li>No time limits on signing or typing</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">Known limitations</h2>
            <p>
              Sign recognition accuracy varies by lighting conditions, camera quality, and signing
              style. We recommend reviewing the transcribed text before submitting. We are
              continuously improving the model with more diverse training data.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[#0A1628] mb-2">Feedback</h2>
            <p>
              If you encounter an accessibility barrier, please tell us:{' '}
              <a href="mailto:access@echosign.app" className="text-[#00D4AA] underline">
                access@echosign.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
