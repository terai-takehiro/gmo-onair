/**
 * 集計条件（① 財務ダッシュボード） (v4)
 *
 * 月／四半期／年／期間指定 ＋ 案件での絞り込み。
 * **中身（期間の計算）は旧実装のままで、見た目だけ v4 に寄せています。**
 *
 * ── 案件で絞ると販管費が外れる ──────────────────────────────
 *
 * 販管費は案件に紐づかないので、案件で絞ると集計から外れます。
 * **これを書かないと「販管費が 0 になった＝壊れた」と読まれます**。
 *
 * ── 「全期間」と、月を空にしたとき ─────────────────────────
 *
 * 期間を外して見たい人のために **「全期間」を種類の1つとして置いています**。
 * 以前はこれが無く、`<input type="month">` を空にして期間を外そうとすると
 * `-01` という壊れた日付がサーバーへ飛んで **400 になっていました**
 * （画面には「損益を読み込めませんでした」としか出ないので原因が見えなかった）。
 * 月を空にしたときは読み込みに行かず、`BudgetDashboardPage` が入力を促します。
 */
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';

export type PeriodMode = 'month' | 'quarter' | 'year' | 'range' | 'all';

const MODES: [PeriodMode, string][] = [
  ['month', '月'], ['quarter', '四半期'], ['year', '年'], ['range', '期間指定'], ['all', '全期間'],
];

export interface ProjectOption {
  id: string;
  gls_number: string | null;
  name: string;
}

export function PeriodBar({
  mode, setMode, month, setMonth, year, setYear, quarter, setQuarter,
  rangeFrom, setRangeFrom, rangeTo, setRangeTo,
  projects, projectId, setProjectId,
}: {
  mode: PeriodMode;
  setMode: (m: PeriodMode) => void;
  month: string;
  setMonth: (v: string) => void;
  year: number;
  setYear: (v: number) => void;
  quarter: number;
  setQuarter: (v: number) => void;
  rangeFrom: string;
  setRangeFrom: (v: string) => void;
  rangeTo: string;
  setRangeTo: (v: string) => void;
  projects: ProjectOption[];
  projectId: string;
  setProjectId: (v: string) => void;
}) {
  return (
    <section className="rounded-card flex flex-col gap-3 border border-border bg-card p-3 lg:px-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* 期間の種類。**1つの枠に隙間なく並べる**（1つだけ選ぶ場所） */}
        <div
          role="group"
          aria-label="集計期間の種類"
          className="rounded-control inline-flex shrink-0 overflow-hidden border border-border"
        >
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`min-h-tap px-3 text-sub lg:min-h-[36px] ${
                mode === m
                  ? 'bg-primary font-bold text-primary-foreground'
                  : 'text-secondary-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'month' && (
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[9.5rem]" />
        )}

        {(mode === 'quarter' || mode === 'year') && (
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
            className="w-24"
            aria-label="年"
          />
        )}

        {mode === 'quarter' && (
          <div role="group" aria-label="四半期" className="rounded-control inline-flex overflow-hidden border border-border">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuarter(q)}
                aria-pressed={quarter === q}
                className={`min-h-tap px-3 text-sub lg:min-h-[36px] ${
                  quarter === q
                    ? 'bg-primary font-bold text-primary-foreground'
                    : 'text-secondary-foreground hover:bg-muted'
                }`}
              >
                {q}Q
              </button>
            ))}
          </div>
        )}

        {/*
          * **全期間だけ「計上月が空の行も入る」ことを書く。**
          * 期間で絞ると `recognition_date` が空の行は必ず外れるので、月ごとの合計を
          * 足しても全期間と一致しないことがある。黙っていると数え間違いに見える。
          */}
        {mode === 'all' && (
          <span className="text-note text-muted-foreground">
            {projectId
              ? '案件を選んだので期間で絞っていません（期間の種類から変えられます・計上月を入れていない行も入ります）'
              : '期間で絞らずに集計します（計上月を入れていない行も入ります）'}
          </span>
        )}

        {mode === 'range' && (
          <span className="flex items-center gap-1.5">
            <Input type="month" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="w-[9.5rem]" aria-label="開始月" />
            <span className="text-sub text-muted-foreground" aria-hidden="true">〜</span>
            <Input type="month" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="w-[9.5rem]" aria-label="終了月" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sub shrink-0 text-muted-foreground">案件で絞り込む</span>
        {/*
          * ⚠️ **`basis` を持たせて潰さない。** `flex-1` と `min-w-0` だけだと、
          * 同じ行に注意書きが増えたときに**選んだ案件名が `G··×` まで縮む**
          * （実測）。何で絞っているか分からない絞り込み欄は用をなさない。
          */}
        <div className="min-w-0 flex-1 basis-[260px] sm:max-w-[420px]">
          <SearchableSelect
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.gls_number ?? 'GLS未発番'} ${p.name}`,
            }))}
            value={projectId}
            onChange={setProjectId}
            placeholder="全案件（販管費を含む）"
          />
        </div>
        {projectId && (
          <>
            <Button variant="ghost" onClick={() => setProjectId('')}>解除</Button>
            {/* **書かないと「販管費が0になった＝壊れた」と読まれる** */}
            <span className="text-note w-full text-warning sm:w-auto">
              案件で絞り込み中は販管費が集計から外れます（案件に紐づかないため）
            </span>
          </>
        )}
      </div>
    </section>
  );
}
