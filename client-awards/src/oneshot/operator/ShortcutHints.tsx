export default function ShortcutHints() {
  const items: { keys: string[]; label: string }[] = [
    { keys: ['Space', '↵'], label: 'TAKE' },
    { keys: ['X', '/', 'Esc'], label: 'CLEAR' },
    { keys: ['↑', '↓'], label: 'NOMINEE' },
    { keys: ['0', '–', '9'], label: 'MODULE' },
    { keys: ['F'], label: '全画面' },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.keys.map((k, j) => (
            <kbd
              key={j}
              className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded border border-slate-700 bg-slate-800/80 text-[11px] font-semibold text-slate-200"
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
