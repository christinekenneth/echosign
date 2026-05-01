import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 bg-black bg-opacity-40 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#00D4AA] flex items-center justify-center font-bold text-[#0A1628]">
            ES
          </div>
          <span className="text-2xl font-bold">EchoSign</span>
        </div>
        <div className="flex gap-6 text-sm font-medium">
          <a href="#about" className="hover:text-[#00D4AA] transition">About</a>
          <a href="#features" className="hover:text-[#00D4AA] transition">Features</a>
          <Link href="/widget" className="px-4 py-2 bg-[#00D4AA] text-[#0A1628] rounded-lg font-bold hover:bg-opacity-90 transition">
            Try Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-8 py-24 text-center">
        <h1 className="text-6xl font-bold mb-6 leading-tight">
          Banking made accessible for <span className="text-[#00D4AA]">everyone</span>
        </h1>
        <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
          EchoSign uses sign language recognition to help Deaf and hard of hearing customers submit complaints to their bank — with an avatar that understands and responds in British Sign Language.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/widget"
            className="px-8 py-4 bg-[#00D4AA] text-[#0A1628] rounded-lg font-bold text-lg hover:bg-opacity-90 transition"
          >
            Open Widget
          </Link>
          <button className="px-8 py-4 border-2 border-[#00D4AA] rounded-lg font-bold text-lg hover:bg-[#00D4AA] hover:text-[#0A1628] transition">
            Learn More
          </button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-bold mb-16 text-center">Why EchoSign?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: 'Sign Language First',
              desc: 'Both the instructions and feedback are signed in British Sign Language — no reading required.',
              icon: '🤟',
            },
            {
              title: 'Visual Navigation',
              desc: 'Icon-based tiles and animations. Non-readers understand every step without text.',
              icon: '👁️',
            },
            {
              title: 'Always Have Help',
              desc: 'At any point, tap for a human interpreter. No AI decision is irreversible.',
              icon: '👥',
            },
            {
              title: 'Fast & Secure',
              desc: 'Video never leaves your phone. Your complaint reaches your bank in minutes.',
              icon: '🔐',
            },
            {
              title: '5 Languages',
              desc: 'English, Yoruba, Hausa, Igbo, French. Switch anytime in the app.',
              icon: '🌍',
            },
            {
              title: 'Track Progress',
              desc: 'See your complaint status in real-time. Get signed updates from your bank.',
              icon: '📍',
            },
          ].map((feature, i) => (
            <div key={i} className="bg-gray-800 bg-opacity-50 p-8 rounded-lg border border-gray-700 hover:border-[#00D4AA] transition">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow diagram */}
      <section className="max-w-4xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-bold mb-16 text-center">How It Works</h2>
        <div className="space-y-6">
          {[
            { num: 1, title: 'Choose a mode', desc: 'Sign in British Sign Language or type your complaint' },
            { num: 2, title: 'Pick the issue', desc: 'Select from 6 common banking problems — by picture, no text needed' },
            { num: 3, title: 'Sign your complaint', desc: 'Record in the camera. Get live feedback and confidence score.' },
            { num: 4, title: 'Review & confirm', desc: 'The avatar signs back what it understood. You approve or redo.' },
            { num: 5, title: 'Track progress', desc: 'See your complaint status with signed updates from the bank.' },
          ].map((step) => (
            <div key={step.num} className="flex gap-6 items-start">
              <div className="w-12 h-12 rounded-full bg-[#00D4AA] text-[#0A1628] font-bold text-lg flex items-center justify-center flex-shrink-0">
                {step.num}
              </div>
              <div className="flex-1 pt-2">
                <h3 className="text-xl font-bold mb-1">{step.title}</h3>
                <p className="text-gray-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-8 py-20 text-center">
        <h2 className="text-4xl font-bold mb-6">Ready to submit a complaint?</h2>
        <p className="text-xl text-gray-300 mb-8">
          Open the widget below and communicate in the way that works best for you.
        </p>
        <Link
          href="/widget"
          className="inline-block px-8 py-4 bg-[#00D4AA] text-[#0A1628] rounded-lg font-bold text-lg hover:bg-opacity-90 transition"
        >
          Open EchoSign Widget
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700 px-8 py-8 text-center text-sm text-gray-500">
        <p>EchoSign • Making banking accessible for Deaf communities • 2025</p>
      </footer>
    </div>
  );
}
