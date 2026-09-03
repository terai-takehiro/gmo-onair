/**
 * 「日付で指定」— 利用日（収録日）と回番号をまとめて登録する
 * （例: 9/7 に #17,18,19。9/2 の仕様変更・調査項目 S5）
 *
 * ── なぜこのタブが要るのか ──────────────────────────────────
 *
 * 既存の2つの作り方では**日付と回番号を同時に決められなかった**（実測）。
 *   ・「話数で指定」（`POST /episodes/batch`） … 番号は打てるが日付が入らない
 *   ・「頻度で作る」（`POST /episodes/generate`） … 日付は入るが番号は自動採番
 * 現場の実務は「9/7｜#17,18,19」のように**日と番号を人が決めて打ち込む**形なので、
 * それをそのまま受ける3つ目の口（`POST /episodes/dated`）に対応する画面。
 *
 * ── 行を足して複数の日をまとめて打てる ────────────────────────
 *
 * 「9/7 に #17-19、9/14 に #20-22」のように**日ごとに1行**。行の `key` は
 * `crypto.randomUUID()` で持つ（並びの番号を `key` にすると、途中の行を消したときに
 * 入力が1つずれる）。
 *
 * ── 実行前に必ずプレビュー（dry_run）を見せる ──────────────────
 *
 * お金の行が増えることもあるので、押したあとで分かるのは事故
 * （`docs/design/v4/regular-series.md` §7）。「内容を確かめる」→「作成する」の
 * 2段階にし、**入力を変えたらプレビューは「古い」印に戻す**（`GenerateEpisodesForm`
 * と同じ作法）。
 *
 * ⚠️ **「回の単価」は 2026-09 の依頼で廃止した**——1日で複数本撮ると回あたりの
 * 単価が下がるため固定値は成立せず、この画面の単価入力欄は削除した。金額は
 * ひとまとまり（見積・確定売上）単位で持つ（別担当が実装する「ひとまとまりの見積」UI）。
 *
 * ── ぶつかったら通さない／飛び番は通す ────────────────────────
 *
 * 既にある回番号とぶつかっている間は「作成する」を押せない（黙って上書き・黙って
 * 飛ばすのは禁止・ご判断）。一方 **飛び番（#17,#18,#20）は止めない** —
 * 実務では欠番が起きるので、警告を出すだけで通す。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2, TriangleAlert } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import {
  parseEpisodeSpec, describeEpisodeNumbers, EpisodeSpecError,
} from '@gmo-onair/shared/src/production/episodeSpec';

interface DatedRow { key: string; date: string; spec: string }

interface PreviewEntry {
  recording_date: string;
  numbers: number[] | null;
  count: number;
  conflicts: number[];
  existing_on_date: number;
}
interface PreviewData {
  entries: PreviewEntry[];
  summary: { dates_total: number; episodes_to_create: number; conflicts: number[]; gaps: number[] };
}

function newRow(): DatedRow {
  return { key: crypto.randomUUID(), date: '', spec: '' };
}

/** 1行ぶんの「その場プレビュー」。読めない指定はそのまま理由を出す */
function describeRow(spec: string): { ok: true; text: string } | { ok: false; text: string } | null {
  if (!spec.trim()) return null;
  try {
    const parsed = parseEpisodeSpec(spec);
    if (parsed.mode === 'explicit') {
      return { ok: true, text: `${describeEpisodeNumbers(parsed.numbers)}（${parsed.numbers.length}件）` };
    }
    return { ok: true, text: `次の話数から${parsed.count}件（番号は自動）` };
  } catch (e) {
    return { ok: false, text: e instanceof EpisodeSpecError ? e.message : '読み取れませんでした' };
  }
}

export function DatedEpisodesForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<DatedRow[]>(() => [newRow()]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const patch = (key: string, part: Partial<DatedRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...part } : r)));
    // 入力を変えたらプレビューは「古い」印に戻す（消さないのは、直前の結果と
    // 見比べて何を変えたか分かるようにするため）
    setPreviewKey(null);
  };

  const entries = useMemo(() => rows
    .filter((r) => r.date && r.spec.trim())
    .map((r) => ({
      recording_date: r.date,
      episodes: r.spec.trim(),
    })), [rows]);

  const currentKey = JSON.stringify(entries);
  const isStale = preview !== null && previewKey !== currentKey;
  const canPreview = entries.length > 0 && rows.every((r) => !r.spec.trim() || describeRow(r.spec)?.ok !== false);

  const previewMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/dated`, { entries, dry_run: true }),
    onSuccess: (r) => { setPreview(r.data.data as PreviewData); setPreviewKey(currentKey); },
    onError: (e) => notifyApiError('確かめられませんでした', e),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/dated`, { entries }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // この画面は単価を持たない（「回の単価」概念は 2026-09 の依頼で廃止済み）が、
      // 他のタブ（見積・財務③）が読む鍵を対で落としておく
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      // サーバーは作った回に標準工程テンプレートも自動で当てる
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      // 請求まとめ（invoice_groups）は回を束ねるので、開いていれば引き直す
      qc.invalidateQueries({ queryKey: ['invoice-groups', projectId] });
      notifySuccess(`回を${r.data?.data?.summary?.episodes_created ?? 0}件登録しました`);
      onDone();
    },
    onError: (e) => notifyApiError('回を登録できませんでした', e),
  });

  const conflicts = preview && !isStale ? preview.summary.conflicts : [];
  const readyToCreate = !!preview && !isStale && conflicts.length === 0
    && preview.summary.episodes_to_create > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const hint = describeRow(row.spec);
          return (
            <div key={row.key} className="rounded-note border border-border p-2">
              {/* 375px は縦積み・広い画面で「日付／回」の2列に開く */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)]">
                <div>
                  <Label htmlFor={`dated-date-${row.key}`}>利用日（収録日）</Label>
                  <Input
                    id={`dated-date-${row.key}`} type="date" className="mt-1"
                    value={row.date} onChange={(e) => patch(row.key, { date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`dated-spec-${row.key}`}>この日の回</Label>
                  <Input
                    id={`dated-spec-${row.key}`} type="text" inputMode="text" className="mt-1"
                    placeholder="例: #17,18,19 ／ 17-19 ／ 3"
                    value={row.spec} onChange={(e) => patch(row.key, { spec: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-1 flex items-start gap-2">
                <p className={`text-sub-sm min-w-0 flex-1 ${hint && !hint.ok ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {hint ? hint.text : '回番号を「#17,18,19」や「17-19」で。数字だけなら件数（番号は自動）です。'}
                </p>
                {rows.length > 1 && (
                  <Button
                    variant="ghost" size="icon-sm" aria-label={`${i + 1}行目を消す`}
                    onClick={() => { setRows((prev) => prev.filter((r) => r.key !== row.key)); setPreviewKey(null); }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, newRow()])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />別の日を足す
      </Button>

      <Button
        type="button" variant="outline" disabled={!canPreview || previewMutation.isPending}
        onClick={() => previewMutation.mutate()}
      >
        <CalendarClock className="mr-1 h-4 w-4" aria-hidden="true" />内容を確かめる
      </Button>

      {preview && (
        <div className="rounded-note border border-border bg-surface-subtle p-2">
          {isStale ? (
            <p className="text-sub flex items-center gap-1 text-warning">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              内容が変わりました。もう一度「内容を確かめる」を押してください。
            </p>
          ) : (
            <>
              <p className="text-sub">
                登録: {preview.summary.dates_total}日・{preview.summary.episodes_to_create}件
              </p>
              <ul className="text-sub-sm mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-muted-foreground">
                {preview.entries.map((e) => (
                  <li key={e.recording_date} className={e.conflicts.length > 0 ? 'text-destructive' : undefined}>
                    {e.recording_date.replace(/-/g, '/')}
                    {e.numbers ? `${describeEpisodeNumbers(e.numbers)}（${e.count}件）` : `${e.count}件（番号は自動）`}
                    {e.existing_on_date > 0 && `　この日は既に${e.existing_on_date}件あります`}
                    {e.conflicts.length > 0 && `　${describeEpisodeNumbers(e.conflicts)} は既にあります`}
                  </li>
                ))}
              </ul>
              {conflicts.length > 0 && (
                <p className="text-sub mt-1 font-bold text-destructive">
                  既にある回とぶつかっています。回番号を直してください（黙って上書きも、黙って飛ばしもしません）。
                </p>
              )}
              {conflicts.length === 0 && preview.summary.gaps.length > 0 && (
                <p className="text-sub mt-1 flex items-start gap-1 text-warning">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  抜けている回番号があります（{describeEpisodeNumbers(preview.summary.gaps)}）。
                  欠番のままでよければこのまま登録できます。
                </p>
              )}
            </>
          )}
        </div>
      )}

      <Button type="button" disabled={!readyToCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
        {preview && !isStale ? `${preview.summary.episodes_to_create}件を登録する` : '登録する'}
      </Button>
    </div>
  );
}
