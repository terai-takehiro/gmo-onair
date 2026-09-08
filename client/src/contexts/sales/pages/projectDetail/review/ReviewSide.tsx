/**
 * ふりかえりの右側 — お金と進み方 (v4 ⑥ 案件記録)
 *
 * ── サブ列に入ることが前提 ──────────────────────────────────
 *
 * 指示書 2-1 で**実施記録がメイン**になったので、この2枚は 340px の列に入ります。
 * そのぶん詰め方が本文側と違います:
 *
 *   ・注記は**ラベルの下段**（横に並べると金額スロットが押されて桁がそろわない）
 *   ・金額スロットは **124px**（一覧の 7 段だとラベルが折り返す）
 *   ・進み方は**縦積み**（ラベル左・数値右）
 *
 * ── 作り話をしない ──────────────────────────────────────────
 *
 * 「見積より N% 高く売れた」は書きません。値引きなのか追加受注なのかは
 * 数字からは分からないので、**並べるだけ**にします。
 *
 * ── 「全体」「会社別」の切替（2026年10月の事業再編・§4.12） ────
 *
 * 案件の粗利は2通りある——「全体」は今までどおり社内取引を除いた
 * `summary`（`getSummary` そのもの・**このトグルを足しても数字も見た目も
 * 変えない**）、「会社別」は `GET /projects/:id/summary-by-entity` を
 * 呼んで SCS/GSS それぞれの実績（社内取引を含む・その会社の帳簿としては
 * 本物の売上・仕入）を並べる。**社内取引の無い案件は内訳が1件以下しか
 * 返らない**ので、そのときはトグルごと出さない（切り替えても同じ数字が
 * 1行出るだけで、切替として意味を持たないため）。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ListChecks } from 'lucide-react';
import api from '@/lib/api';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { KeepPickCard } from './KeepPickCard';
// **会社名は既存の `ENTITY_BADGE_LABEL` を再利用する**（新たに `/legal-entities` を
// 読まない）。同じ定数が `OverviewTab.tsx`（この案件の「計上会社」欄）でも
// 使われており、その docstring 自体が「案件詳細など枠の広い場所で使う」ことを
// 明記している。値そのものは `legal_entities.short_name`（migration 284）の
// 実データと合わせてあり、発行者情報の編集口も name/short_name には無い
// （`legal-entity.service.ts` の `WRITABLE`）ので、ここだけ生で問い合わせて
// 2つ目の情報源を作るより、既にある1つに寄せるほうが「同じ数字を2か所で
// 数えない」（`client/CLAUDE.md`）に沿う
import { ENTITY_BADGE_LABEL } from '../../projectList/stages';

export interface ReviewSummary {
  total_revenue: number;
  total_purchase: number;
  gross_profit: number;
  gross_margin: number;
}

/** `GET /projects/:id/summary-by-entity` の1行（`entity_code` は過渡期に null もありうる） */
export interface EntitySummaryRow {
  entity_code: string | null;
  total_revenue: number;
  total_purchase: number;
  gross_profit: number;
  gross_margin: number;
}

/**
 * お金の金額スロット（指示書 2-5 の指定）。**サブ列（340px）に入るので詰めます** —
 * 一覧の 7 段（…160 / 200 / 240）だと、ラベルが 2 行に折り返します。
 */
const MONEY_W = 'w-[124px]';  // ui-tokens-ok: ふりかえりのサブ列に入る金額スロット

const num = (v: unknown): number => Number(v) || 0;

function entityLabel(code: string | null): string {
  if (code === 'SCS' || code === 'GSS' || code === 'GMO') return ENTITY_BADGE_LABEL[code];
  return '未分類'; // P1 の配線が全箇所揃うまでの過渡期（entity_code が未設定の行）向け
}

export function ReviewSide({
  projectId, expectedAmount, quoted, sentVersion, summary, taskTotal, taskDone, taskLate, eventStart, keepPick, canEdit,
}: {
  projectId: string;
  /** 隔週キープの印（`KeepPickCard`）に渡すもの */
  keepPick: boolean;
  canEdit: boolean;
  expectedAmount: number | string | null;
  quoted: number | null;
  sentVersion: number | null;
  summary?: ReviewSummary;
  taskTotal: number;
  taskDone: number;
  taskLate: number;
  eventStart: string | null;
}) {
  const s = summary;

  const [mode, setMode] = useState<'total' | 'byEntity'>('total');
  const byEntity = useQuery<EntitySummaryRow[]>({
    queryKey: ['project-summary-by-entity', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/summary-by-entity`)).data.data,
    // ふりかえりタブを開くたびに読み直す（`summary` 本体・`ReviewTab.tsx` の `q`/`estimates` と同じ注記）
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const entityRows = byEntity.data ?? [];
  // 会社が1つ以下（社内取引が無い・まだ読み込み中・失敗）ならトグルごと出さない
  const showToggle = entityRows.length > 1;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">お金</h3>
          {showToggle && <MoneyModeToggle mode={mode} onChange={setMode} />}
        </div>
        {mode === 'total' ? (
          <>
            {/* **引き算の順に並べる**（想定 → 見積 → 売上 → 仕入 → 粗利）。
                **このブロックの中身は会社別トグルを足す前と1文字も変えていない** */}
            <Line label="想定金額" value={expectedAmount === null ? null : num(expectedAmount)}
              note="案件をつくったときの見込み" />
            <Line label="見積金額" value={quoted}
              note={sentVersion ? `v${sentVersion}（値引きのあと）` : 'まだ見積を出していません'} />
            <Line label="確定売上" value={s ? s.total_revenue : null} />
            <Line label="仕入（原価）" value={s ? -s.total_purchase : null} />
            <div className="p-3">
              <Line
                label="粗利"
                value={s ? s.gross_profit : null}
                note={s && s.total_revenue > 0 ? `${s.gross_margin}%` : undefined}
                result
                bad={!!s && s.gross_profit < 0}
              />
            </div>
            <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-2.5 text-muted-foreground">
              売上と仕入は<strong className="font-bold">按分後の実績も足した実績</strong>です（財務管理と同じ数え方）。
              <strong className="font-bold">見積との差の読み方はここでは書きません</strong> —
              値引きなのか追加受注なのかは数字からは分からないためです。
            </p>
          </>
        ) : (
          <>
            {entityRows.map((r) => (
              <div key={r.entity_code ?? 'unknown'} className="border-b border-border-faint px-4 py-2.5 last:border-b-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sub font-bold">{entityLabel(r.entity_code)}</span>
                  {r.total_revenue > 0 && (
                    <span className={cn('text-sub-sm text-muted-foreground', r.gross_profit < 0 && 'text-destructive')}>
                      粗利率 {r.gross_margin}%
                    </span>
                  )}
                </div>
                <MiniLine label="売上" value={r.total_revenue} />
                <MiniLine label="仕入（原価）" value={-r.total_purchase} />
                <MiniLine label="粗利" value={r.gross_profit} bad={r.gross_profit < 0} />
              </div>
            ))}
            <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-2.5 text-muted-foreground">
              会社ごとの実績です。<strong className="font-bold">2社間の社内取引を含みます</strong>
              （SCS⇄GSS の請求・仕入も、それぞれの会社の実績として数えます）。
            </p>
          </>
        )}
      </section>

      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">進み方</h3>
        </div>
        {taskTotal === 0 ? (
          <p className="text-sub px-4 py-3 text-muted-foreground">タスクを1つも入れていない案件です。</p>
        ) : (
          <div className="flex flex-col">
            <Stat label="終わったタスク" value={`${taskDone} / ${taskTotal}`} />
            <Stat label="期限を過ぎたまま" value={String(taskLate)} bad={taskLate > 0} />
            {eventStart && <Stat label="実施日" value={eventStart} />}
          </div>
        )}
      </section>
      {/* 3枚目: 隔週キープの資料に載せるか。お金・進み方（事実）のあとに置く（決めごと） */}
      <KeepPickCard projectId={projectId} keepPick={keepPick} canEdit={canEdit} />
    </div>
  );
}

/** 引き算の1段。**利益だけ枠と色を変える**（財務ダッシュボードと同じ考え方） */
function Line({
  label, value, note, result, bad,
}: { label: string; value: number | null; note?: string; result?: boolean; bad?: boolean }) {
  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-2.5',
      result ? 'rounded-note border border-border bg-surface-subtle' : 'border-b border-border-faint',
    )}>
      <span className="min-w-0 flex-1">
        <span className={cn('block', result ? 'text-list' : 'text-sub text-muted-foreground')}>{label}</span>
        {note && <span className="text-note block text-muted-foreground">{note}</span>}
      </span>
      {value === null
        ? <span className="text-sub text-muted-foreground">—</span>
        : <Money value={value} className={cn(MONEY_W, 'shrink-0 justify-end', result && 'text-list', bad && 'text-destructive')} />}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border-faint px-4 py-2.5 last:border-b-0">
      <span className="text-sub min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className={cn('font-number text-list', bad && 'text-destructive')}>{value}</span>
    </div>
  );
}

const MONEY_MODE_LABEL: Record<'total' | 'byEntity', string> = { total: '全体', byEntity: '会社別' };

/** 「全体」「会社別」の切替。**`ForecastModeToggle.tsx`（財務ダッシュボード）と同じ形の部品**
 * — 見た目の言語を画面間でそろえる（新しいトグルの形を増やさない）。ここはカードの
 * 見出し行に収める分、一回り小さくしてある */
function MoneyModeToggle({
  mode, onChange,
}: { mode: 'total' | 'byEntity'; onChange: (m: 'total' | 'byEntity') => void }) {
  return (
    <div role="group" aria-label="粗利の見方" className="rounded-control inline-flex shrink-0 overflow-hidden border border-border">
      {(['total', 'byEntity'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            'min-h-tap px-2.5 text-sub-sm lg:min-h-[28px]',
            mode === m ? 'bg-primary font-bold text-primary-foreground' : 'text-secondary-foreground hover:bg-muted',
          )}
        >
          {MONEY_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/** 会社別カードの中の1段。**`Line` より詰める**（`p-3`/`px-4` の中にもう1段ネストするため、
 * 左右の余白を持たない・値は常にある数字なので `—` の分岐が無い） */
function MiniLine({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-sub-sm min-w-0 flex-1 text-muted-foreground">{label}</span>
      <Money value={value} className={cn(MONEY_W, 'shrink-0 justify-end text-sub-sm', bad && 'text-destructive')} />
    </div>
  );
}
