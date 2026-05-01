interface TileGridProps {
  tiles: Array<{ id: string; icon: string; label: string }>;
  selected?: string | null;
  onSelect: (id: string) => void;
}

export default function TileGrid({ tiles, selected, onSelect }: TileGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          onClick={() => onSelect(tile.id)}
          className={`p-3 rounded-lg border-2 transition-all ${
            selected === tile.id
              ? 'border-[#00D4AA] bg-[#F0FBF9]'
              : 'border-gray-200 bg-white hover:border-[#00D4AA] hover:bg-[#F0FBF9]'
          }`}
        >
          <div className="text-2xl mb-1">{tile.icon}</div>
          <p className="text-xs font-bold text-gray-900 line-clamp-2">{tile.label}</p>
        </button>
      ))}
    </div>
  );
}
