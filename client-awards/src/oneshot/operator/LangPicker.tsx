import { cn } from '@/lib/utils';
import type { Lang } from '../types';

// v2.8.74+: ranking CG の PreviewLang ('ja'|'en'|'both') と同等の 3-mode 化。
// 'both' の場合は内部的に lang='ja' + bilingual=true として扱う。
export type LangMode = 'ja' | 'en' | 'both';

interface Props {
  /** 現在の (lang, bilingual) ペアから派生したモード */
  value: LangMode;
  /** モード変更 → (lang, bilingual) に分解されて親で sendCue */
  onChange: (mode: LangMode) => void;
}

export default function LangPicker({ value, onChange }: Props) {
  const opts: { v: LangMode; label: string }[] = [
    { v: 'ja',   label: 'JA'    },
    { v: 'en',   label: 'EN'    },
    { v: 'both', label: 'JA/EN' },
  ];
  return (
    <div
      className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/50 p-0.5 text-[10px] font-black tracking-widest"
      role="group"
      aria-label="プレビュー言語"
    >
      {opts.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'px-2 py-1 rounded-md transition-colors',
            value === v ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
          )}
          aria-pressed={value === v}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** (lang, bilingual) ペア → LangMode に変換 */
export function toLangMode(lang: Lang, bilingual: boolean): LangMode {
  if (bilingual) return 'both';
  return lang;
}

/** LangMode → (lang, bilingual) ペアに分解 */
export function fromLangMode(mode: LangMode): { lang: Lang; bilingual: boolean } {
  if (mode === 'both') return { lang: 'ja', bilingual: true };
  return { lang: mode, bilingual: false };
}
