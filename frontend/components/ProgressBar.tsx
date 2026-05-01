interface ProgressBarProps {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const dots = Array.from({ length: total }, (_, i) => i);

  return (
    <div className="flex items-center gap-1 mb-3">
      {dots.map((i) => (
        <div key={i} className="flex-1 flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${
              i < current ? 'bg-[#00D4AA]' : i === current ? 'bg-[#0A1628]' : 'bg-gray-300'
            }`}
          />
          {i < total - 1 && (
            <div className={`flex-1 h-0.5 ${i < current ? 'bg-[#00D4AA]' : 'bg-gray-300'}`} />
          )}
        </div>
      ))}
    </div>
  );
}
