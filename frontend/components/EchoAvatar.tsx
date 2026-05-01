'use client';

interface EchoAvatarProps {
  isSigning: boolean;
  bubble: string;
  onReplay: () => void;
}

export default function EchoAvatar({ isSigning, bubble, onReplay }: EchoAvatarProps) {
  return (
    <div className="bg-[#0A1628] pt-6 pb-4 px-4 flex flex-col items-center gap-3 relative">
      {/* Signing pill */}
      <div
        className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full ${
          isSigning
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-700 text-gray-400'
        }`}
      >
        {isSigning ? 'Signing' : 'Standby'}
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-1">
        {/* Head */}
        <div className="w-11 h-11 rounded-full bg-[#1A2B4A] border-2 border-[#00D4AA] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" fill="#1A2B4A" />
            <circle cx="7" cy="9" r="1" fill="#00D4AA" />
            <circle cx="13" cy="9" r="1" fill="#00D4AA" />
            <path d="M7 14c0.8 1 4.2 1 5 0" stroke="#00D4AA" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Body with animated arms */}
        <div className="w-14 h-12 relative flex justify-center">
          {/* Arms */}
          <div className="absolute w-full h-8 flex justify-between px-1 top-0">
            <div
              className={`w-3 h-6 bg-[#1A2B4A] border border-[#00D4AA] rounded-sm origin-top-right transition-transform ${
                isSigning ? 'animate-wave-left' : '-rotate-15'
              }`}
            >
              <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-[#00D4AA]" />
            </div>
            <div
              className={`w-3 h-6 bg-[#1A2B4A] border border-[#00D4AA] rounded-sm origin-top-left transition-transform ${
                isSigning ? 'animate-wave-right' : 'rotate-15'
              }`}
            >
              <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-[#00D4AA]" />
            </div>
          </div>

          {/* Torso */}
          <div className="absolute bottom-0 w-8 h-6 bg-[#1A2B4A] border border-[#00D4AA] rounded-tl-lg rounded-tr-lg rounded-bl-sm rounded-br-sm" />
        </div>

        <p className="text-xs font-bold text-[#00D4AA] tracking-widest">ECHOSIGN</p>
      </div>

      {/* Chat bubble */}
      <div className="bg-[#1A2B4A] border border-[#00D4AA] border-opacity-25 rounded-2xl rounded-br-sm px-3 py-2 max-w-xs">
        <p className="text-xs text-white text-center leading-relaxed">{bubble}</p>
      </div>

      {/* Replay button */}
      <button
        onClick={onReplay}
        className="text-xs font-bold text-[#00D4AA] px-3 py-1 rounded border border-[#00D4AA] border-opacity-30 hover:bg-[#00D4AA] hover:bg-opacity-10 transition-colors"
      >
        ↺ Replay signing
      </button>

      <style jsx>{`
        @keyframes wave-left {
          0% {
            transform: rotate(-44deg) translateY(-3px);
          }
          50% {
            transform: rotate(-22deg) translateY(-7px);
          }
          100% {
            transform: rotate(-44deg) translateY(-3px);
          }
        }
        @keyframes wave-right {
          0% {
            transform: rotate(44deg) translateY(-3px);
          }
          50% {
            transform: rotate(22deg) translateY(-7px);
          }
          100% {
            transform: rotate(44deg) translateY(-3px);
          }
        }
        .animate-wave-left {
          animation: wave-left 1s ease-in-out infinite;
        }
        .animate-wave-right {
          animation: wave-right 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
