/**
 * 「回を足す」— 3つの作り方をタブで切り替える
 * （`docs/design/v4/regular-series.md` §7・§10-5 ＋ 9/2 の仕様変更・調査項目 S5）
 *
 * ── 3つの作り方 ─────────────────────────────────────────
 *
 * ① **日付で指定**（既定・9/2 の仕様変更で追加）: 「9/7｜#17,18,19」のように
 *    **利用日と回番号を同時に**打ち込む。中身は `DatedEpisodesForm.tsx`。
 *    ここが既定なのは、現場が回を増やすときの主な打ち方だから
 *    （②は日付が入らず、③は番号を選べない）。
 * ② **話数で指定**（従来）: 「追加する数」をテキストで受ける（依頼: 「複数の回を
 *    登録することもあるのでテキストで入力出来るようにしたい『#1-2』みたいに」）。
 *    パーサー（`shared/src/production/episodeSpec.ts`）が「単純な数＝件数」
 *    「範囲・カンマ区切り＝明示的な話数」を読み分ける。**日付は入らない**ので、
 *    あとから「回を直す」で利用日を入れることになる。
 * ③ **頻度で作る**: 「毎週／隔週／…」の繰り返し×期間×1日あたりの本数で
 *    サーバーに日付を組み立てさせる（`POST /episodes/generate`）。中身は
 *    `GenerateEpisodesForm.tsx`。
 *
 * プレビューは**必ず実行前に出す**（お金の行が増えることもあるので、押したあとで
 * 分かるのは事故 — 設計文書 §7）。
 *
 * ── なぜ `EpisodesPanel.tsx` から分けたか ──────────────────────
 *
 * 1ファイル400行の上限（`scripts/check-file-size.mjs`）。3つ目のタブを足した時点で
 * `EpisodesPanel.tsx` が上限に当たった。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import {
  parseEpisodeSpec, describeEpisodeNumbers, EpisodeSpecError,
} from '@gmo-onair/shared/src/production/episodeSpec';
import { DatedEpisodesForm } from './DatedEpisodesForm';
import { GenerateEpisodesForm } from './GenerateEpisodesForm';

/**
 * 案件の「レギュラーの取り決め」（migration 262・regular-series.md §3）のうち、
 * 「頻度で作る」の初期値になる3つだけ。呼び出し元（`TasksTab.tsx`・案件詳細の回タブ）は
 * `ProjectDetail` からそのまま渡せる（読むだけ・ここでは保存しない）。
 */
export interface SeriesDefaults {
  recording_cadence?: 'weekly' | 'biweekly' | 'monthly_nth_weekday' | 'none' | null;
  recording_per_day_count?: number | null;
  episode_unit_price?: number | null;
}

type AddMode = 'dated' | 'text' | 'frequency';

const MODES: Array<[AddMode, string]> = [
  ['dated', '日付で指定'],
  ['text', '話数で指定'],
  ['frequency', '頻度で作る'],
];

const MODE_SUB: Record<AddMode, string> = {
  dated: '「9/7 に #17,18,19」のように、利用日とその日の回をまとめて登録します。日を足して何日ぶんでもまとめて打てます。',
  text: '数字だけなら「次の話数から連番でN件」、"1-2" や "1,3,5-8" のように書くと話数を指定して作れます（日付は入りません）。',
  frequency: '頻度・期間・1日あたりの本数から日付を組み立てます。作る前に必ず内容を確かめます。',
};

/**
 * `nextNum`（この案件の次の話数）は既に読み込み済みの一覧から出す簡易な見積もりで、
 * 採番そのものはサーバーが取引の中でアトミックに行う。ここでは「思っていた話数と
 * ズレていないか」を実行前に気づかせるだけの表示用途（②「話数で指定」だけで使う）。
 */
export function AddEpisodesDialog({
  open, onOpenChange, projectId, nextNum, seriesDefaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  nextNum: number;
  seriesDefaults?: SeriesDefaults;
}) {
  const [mode, setMode] = useState<AddMode>('dated');
  const [text, setText] = useState('1');
  const qc = useQueryClient();

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, spec: parseEpisodeSpec(text) };
    } catch (e) {
      const message = e instanceof EpisodeSpecError ? e.message : '読み取れませんでした';
      return { ok: false as const, message };
    }
  }, [text]);

  // プレビュー表示用の話数リスト（件数入力は「次の話数から連番」と仮定して見せる）
  const previewNumbers = useMemo(() => {
    if (!parsed.ok) return null;
    if (parsed.spec.mode === 'explicit') return parsed.spec.numbers;
    return Array.from({ length: parsed.spec.count }, (_, i) => nextNum + i);
  }, [parsed, nextNum]);

  const mismatch = parsed.ok && parsed.spec.mode === 'explicit' && previewNumbers != null
    && previewNumbers[0] !== nextNum;

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/batch`, { episodes: text }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // サーバーは `revenue_budget_per_episode` 付きの呼び出しで回ごとに売上行も作る。
      // この画面は単価を送らないが、他のタブと同じ対で落としておく
      // （片方だけだと将来単価を配線した日に「作ったのに古いまま」が再発する）
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      const n = Array.isArray(r.data?.data) ? r.data.data.length : (previewNumbers?.length ?? 1);
      notifySuccess(`回を${n}件足しました`);
      onOpenChange(false);
      setText('1');
    },
    onError: (e) => notifyApiError('回を足せませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="回を足す"
      sub={MODE_SUB[mode]}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          {/* 「日付で指定」「頻度で作る」は確認→実行の2段階を中のフォームが持つので、
              ここには置かない（下端に2つ実行ボタンが並ぶのを避ける） */}
          {mode === 'text' && (
            <Button onClick={() => create.mutate()} disabled={create.isPending || !parsed.ok}>
              足す
            </Button>
          )}
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {/* タブの ARIA (tab/tablist) は名乗らない — 矢印キー移動・tabpanel を
            実装していないので、読み上げに「タブ」と言うと約束と挙動が食い違う。
            押した状態を持つボタンの組 (aria-pressed) として出す。
            375px では3列に並べると窮屈なので2列 + 3つ目は横いっぱいにする */}
        <div role="group" aria-label="回の作り方を切り替える" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {MODES.map(([key, label], i) => {
            const on = mode === key;
            return (
              <button
                key={key} type="button" aria-pressed={on}
                onClick={() => setMode(key)}
                className={`min-h-tap rounded-control border text-sub ${
                  i === MODES.length - 1 ? 'col-span-2 sm:col-span-1' : ''
                } ${
                  on ? 'border-primary-border bg-primary-surface font-bold text-primary' : 'border-border text-muted-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === 'dated' && (
          <DatedEpisodesForm projectId={projectId} onDone={() => { onOpenChange(false); setMode('dated'); }} />
        )}

        {mode === 'text' && (
          <div className="flex flex-col gap-2">
            <div>
              <Label htmlFor="ep-spec">追加する数</Label>
              <Input
                id="ep-spec" type="text" inputMode="text" className="mt-1"
                placeholder={'例: 2 ／ 1-2 ／ #1-2 ／ 1,3,5-8'}
                value={text} onChange={(e) => setText(e.target.value)}
              />
            </div>
            {!parsed.ok ? (
              <p className="text-sub text-destructive">{parsed.message}</p>
            ) : previewNumbers ? (
              <div className="rounded-note border border-border bg-surface-subtle p-2">
                <p className="text-sub">
                  作成する回: {describeEpisodeNumbers(previewNumbers)}（{previewNumbers.length}件）
                </p>
                {mismatch && (
                  <p className="text-sub text-warning mt-1">
                    ⚠ 次の話数は #{nextNum} です。指定と次の話数がズレています — 意図した範囲か確かめてください。
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {mode === 'frequency' && (
          <GenerateEpisodesForm
            projectId={projectId}
            onDone={() => { onOpenChange(false); setMode('dated'); }}
            defaultCadence={seriesDefaults?.recording_cadence}
            defaultPerDayCount={seriesDefaults?.recording_per_day_count}
            defaultUnitPrice={seriesDefaults?.episode_unit_price}
          />
        )}
      </div>
    </FormDialog>
  );
}
