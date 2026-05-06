import { cn } from '@/lib/utils';
import type { Lang, ModuleDef } from '../types';
import { moduleIdToCueKey } from '../lib/moduleKeyMap';

// v2.8.76+: EventModuleConfig.modules を直接受け取る形に refactor。
// 旧版 (v2.8.71) は ModuleMap (legacy preset map) + 固定 ORDER 配列だったが、
// 段階4 でユーザー追加モジュール (custom-{uuid}) をサポートするため、
// 親が ModuleDef[] を渡し、本コンポーネントはそれを描画するだけに変更。

interface Props {
  /** 表示すべきモジュール一覧 (visibility/order 適用済み)。親で前処理。 */
  modules: ModuleDef[];
  /** 現在選択中の cue.moduleKey (短キー or custom-{uuid}) */
  selected: string;
  onSelect: (cueKey: string) => void;
  lang: Lang;
}

export default function ModulePickerRow({ modules, selected, onSelect, lang }: Props) {
  const isJa = lang === 'ja';
  return (
    // v2.8.79+: モバイルは 3-col + py 縮小でコンパクト化
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-1.5">
      {modules.map((m) => {
        const cueKey = moduleIdToCueKey(m.id);
        const active = cueKey === selected;
        const label = isJa ? m.label.ja : m.label.en;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(cueKey)}
            className={cn(
              'flex flex-col items-start rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2 text-left transition-all',
              active
                ? 'border-amber-500 bg-amber-950/50 ring-1 ring-amber-700/40'
                : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-700'
            )}
            title={`${m.id}${m.shortcutKey ? ` · key: ${m.shortcutKey}` : ''}`}
          >
            <span className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black tracking-wider leading-none w-full min-w-0">
              {m.shortcutKey && (
                <kbd className="inline-flex items-center justify-center min-w-[1.2rem] sm:min-w-[1.5rem] h-4 sm:h-5 px-1 rounded border border-slate-700 bg-slate-800 text-[10px] sm:text-[11px] font-bold text-amber-400 shrink-0">
                  {m.shortcutKey}
                </kbd>
              )}
              <span className={cn('truncate', active ? 'text-amber-300' : 'text-slate-300')}>{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
