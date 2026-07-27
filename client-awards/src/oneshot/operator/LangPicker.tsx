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
    { v: 'ja', label: 'JA'    },
    { v: 'en', label: 'EN'    },
    { v: 'both', label: 'JA/EN' },
  ];
  return (
    <div
      className="flex items-center rounded-lg border border-border/60 bg-background/50 p-0.5 text-[10px] font-black tracking-widest"
      role="group"
      aria-label="プレビュー言語"
    >
      {opts.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'px-2 py-1 rounded-md transition-colors',
            value === v ? 'bg-warning text-foreground' : 'text-muted-foreground hover:bg-card hover:text-muted-foreground'
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

/** LangMode → (lang, bilingual) ペアに分解。
 * v2.8.83+: 'both' でも bilingual=false (in-CG 縦スタックは廃止)。
 * 'both' の場合は OneShotControlPage 側で **JA/EN を別々の CG として横並びプレビュー**する。
 * cue.lang は primary lang ('ja') を保持し、output URL は ?lang= で個別レンダリング。 */
export function fromLangMode(mode: LangMode): { lang: Lang; bilingual: boolean } {
  if (mode === 'both') return { lang: 'ja', bilingual: false };
  return { lang: mode, bilingual: false };
}
