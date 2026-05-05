export default function ShortcutHints() {
  const items: { keys: string[]; label: string }[] = [
    { keys: ['Space', '↵'], label: 'TAKE' },
    { keys: ['Esc'], label: 'CLEAR' },
    { keys: ['↑', '↓'], label: 'NOMINEE' },
    { keys: ['0', '–', '6'], label: 'MODULE' },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {it.keys.map((k, j) => (
            <kbd
              key={j}
              className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded border border-slate-700 bg-slate-800/80 text-[9px] font-semibold text-slate-300"
            >
              {k}
            </kbd>
          ))}
          <span className="font-semibold tracking-wider">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
