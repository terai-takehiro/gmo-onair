import { useEffect, useState } from 'react';
import { X, Save, BarChart3, Percent, Hash } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CgCategory, VoteDisplay } from '@/cg/types';

interface Props {
  open: boolean;
  category: CgCategory | null;
  voteDisplay: VoteDisplay;
  onChangeDisplay: (d: VoteDisplay) => void;
  onClose: () => void;
  onSaved: () => void;
}

/** 投票数の手動入力＋集計表示切替 (vote パターン専用、ControlPage から開く) */
export default function VoteSettingsDialog({
  open, category, voteDisplay, onChangeDisplay, onClose, onSaved,
}: Props) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!category) return;
    const m: Record<number, number> = {};
    for (const e of category.entries) m[e.id] = e.vote_count ?? 0;
    setCounts(m);
  }, [category]);

  if (!open || !category) return null;

  const top3 = category.entries.filter((e) => e.rank != null && e.rank >= 1 && e.rank <= 3);
  const total = Object.values(counts).reduce((s, v) => s + (v || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/awards/categories/${category.id}/vote-counts`, {
        counts: Object.entries(counts).map(([entryId, voteCount]) => ({
          entryId: parseInt(entryId), voteCount,
        })),
      });
      setSavedAt(Date.now());
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-800 shrink-0">
          <BarChart3 className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-black tracking-widest text-slate-200">投票数を入力</span>
          <span className="text-xs text-slate-400 truncate">/ {category.description || category.name}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 表示モード切替 */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-[10px] font-black tracking-widest text-slate-400 mb-2">VOTE-REVEAL の表示</div>
            <div className="flex gap-2">
              <button
                onClick={() => onChangeDisplay('count')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold transition',
                  voteDisplay === 'count'
                    ? 'border-amber-500 bg-amber-900/40 text-amber-200'
                    : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800',
                )}
              >
                <Hash className="h-3.5 w-3.5" />
                投票数 (票)
              </button>
              <button
                onClick={() => onChangeDisplay('percent')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold transition',
                  voteDisplay === 'percent'
                    ? 'border-amber-500 bg-amber-900/40 text-amber-200'
                    : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800',
                )}
              >
                <Percent className="h-3.5 w-3.5" />
                パーセント (%)
              </button>
            </div>
          </div>

          {/* TOP3 投票数入力 */}
          <div>
            <div className="text-[10px] font-black tracking-widest text-slate-400 mb-2">
              TOP3 の投票数 (合計 {total.toLocaleString()} 票)
            </div>
            {top3.length === 0 && (
              <div className="text-xs text-slate-500 px-3 py-4 bg-slate-950/40 rounded border border-slate-800">
                TOP3 が未確定です。先に「ダミーポイント生成」または rank を入力してください。
              </div>
            )}
            <div className="space-y-2">
              {top3.map((e, i) => {
                const v = counts[e.id] ?? 0;
                const pct = total > 0 ? (v / total) * 100 : 0;
                return (
                  <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-full bg-amber-600 text-slate-950 flex items-center justify-center text-base font-black">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-100 truncate">{e.name}</div>
                        {e.org && <div className="text-[11px] text-slate-400 truncate">{e.org}</div>}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(v)}
                        onChange={(ev) => {
                          const cleaned = ev.target.value.replace(/[^\d]/g, '');
                          const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                          setCounts({ ...counts, [e.id]: isNaN(n) ? 0 : Math.max(0, n) });
                        }}
                        onFocus={(ev) => ev.target.select()}
                        placeholder="0"
                        className="w-32 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-right text-base font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-xs text-slate-400 shrink-0 w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                    {/* preview bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 leading-relaxed">
            ※ API 連携実装後はリアルタイム自動更新になります。現状はマニュアル入力 (バックアップとしても残ります)。
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900/60 shrink-0">
          {savedAt && (
            <span className="text-[10px] text-emerald-400">
              保存しました ({new Date(savedAt).toLocaleTimeString()})
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-bold text-slate-200"
          >
            閉じる
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2 text-xs font-black tracking-widest text-slate-950"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
