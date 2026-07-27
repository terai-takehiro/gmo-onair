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
    // v2.9.95+: コンテナ幅基準の auto-fill (各ボタン最小 124px) で、統合送出コックピットの
    // 狭いカラムでも 7 列を押し込まず自動折り返し。ラベルが読めるようボタンを拡大。
    <div className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-1.5">
      {modules.map((m) => {
        const cueKey = moduleIdToCueKey(m.id);
        const active = cueKey === selected;
        const label = isJa ? m.label.ja : m.label.en;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(cueKey)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-2.5 min-h-tap text-left transition-all',
              active
                ? 'border-warning bg-warning/50 ring-1 ring-warning/40'
                : 'border-border bg-background/40 hover:bg-card hover:border-border'
            )}
            title={m.id}
          >
            <span className={cn('text-sm font-black tracking-wide leading-tight min-w-0 break-words', active ? 'text-warning-strong' : 'text-foreground')}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
