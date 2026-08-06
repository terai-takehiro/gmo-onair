/**
 * 案件詳細の頭 (v4 ⑥) — 一覧に戻る / 案件名 / ステージ / タブ
 *
 * ── どのタブでも同じ位置に出しつづける ──────────────────────
 *
 * モックの言葉そのままです:
 * 「まわりのヘッダー (一覧に戻る・案件名・ステージ・タブ) は、
 *   どのタブでも同じ位置に出しつづけます」。
 * タブごとに見出しの高さが変わると、タブを切り替えるたびに本文が上下に跳ねて
 * **読んでいた場所を見失います**。だからここは1か所にまとめて、
 * タブは中身だけを差し替えます。
 *
 * ── ステージは「押して変える」ものにしてある ────────────────
 *
 * モックは E→D→C→B→A を横に並べ、いまの段だけ名前を出します。
 * 状態を見る場所と変える場所を分けると、**変えたあとに見に戻る**ことになるので
 * 同じ場所にしました。押すと確認を出します (`confirmAction`) — ステージは
 * 売上の見込みと連動していて、取り違えると数字が動くためです。
 */
import { ArrowLeft, Pencil, Mic, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PROJECT_TABS, type ProjectTabKey } from './tabs';
import { ProjectStageLabels, type ProjectStage } from '@/types';

/** ステージの並び。モックと同じ「問合せ → 受注」。終わったもの2つは横に並べない */
const STAGE_STEPS: { stage: ProjectStage; key: string }[] = [
  { stage: 'neta', key: 'E' },
  { stage: 'd_hold', key: 'D' },
  { stage: 'c_proposal', key: 'C' },
  { stage: 'b_verbal', key: 'B' },
  { stage: 'a_won', key: 'A' },
];

/** ステージの短い名前 (押せる帯に入る長さ) */
const STAGE_SHORT: Record<string, string> = {
  neta: '問合せ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定', a_won: '受注済',
};

export interface DetailHeaderProps {
  id: string;
  name: string;
  customerName: string | null;
  glsNumber: string | null;
  code: string | null;
  stage: ProjectStage;
  /** 連続もの (回を持つ) か。タブの出し分けに使う */
  isSeries: boolean;
  tab: ProjectTabKey;
  counts: Partial<Record<ProjectTabKey, number>>;
  onChangeStage: (next: ProjectStage) => void;
}

export function DetailHeader({
  id, name, customerName, glsNumber, code, stage, isSeries, tab, counts, onChangeStage,
}: DetailHeaderProps) {
  const navigate = useNavigate();
  const tabs = PROJECT_TABS.filter((t) => !t.seriesOnly || isSeries);
  const terminal = stage === 's_completed' || stage === 'e_lost';

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3.5 lg:px-6">
        <Link
          to="/sales/projects"
          aria-label="案件一覧に戻る"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-h1 min-w-0 truncate" title={name}>{name}</h1>
            <button
              type="button"
              onClick={() => navigate(`/sales/projects/${id}/edit`)}
              aria-label="案件の内容を直す"
              title="案件の内容を直す"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control-md hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <p className="text-sub mt-0.5 truncate text-muted-foreground">
            {customerName || 'お客様 未設定'}
            {(glsNumber || code) && ` ・ ${glsNumber || code}`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/*
            打合せを録音 — **中身はやり取りタブが持っています**。
            ここは入口なのでタブへ送るだけにします (同じダイアログを2か所から
            開けるようにすると、状態を持つ場所が2つになって必ずずれます)。
          */}
          <Button
            variant="outline"
            title="やり取りタブで録音します"
            onClick={() => navigate(`/sales/projects/${id}/thread`)}
          >
            <Mic className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />打合せを録音
          </Button>
          <Button onClick={() => navigate(`/sales/projects/${id}/task`)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを追加
          </Button>
        </div>
      </div>

      {/* タブ ＋ ステージ。**横に入りきらないときは折り返さず横スクロール** */}
      <div className="flex flex-wrap items-end gap-3 px-4 lg:px-6">
        <div className="-mb-px flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = t.key === tab;
            const n = counts[t.key];
            return (
              <Link
                key={t.key}
                to={`/sales/projects/${id}/${t.key}`}
                aria-current={on ? 'page' : undefined}
                className={`min-h-tap text-list inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px] ${
                  on ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
                {n !== undefined && n > 0 && (
                  <span className="text-badge font-number inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-chip bg-muted px-1.5 text-muted-foreground">
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/*
          ステージ。終わった案件 (完了・失注) では横並びを出しません —
          E〜A の段に居ないので、どれかを光らせると嘘になります。
        */}
        {terminal ? (
          <span className="text-sub mb-2 shrink-0 rounded-control border border-border px-3 py-1.5 text-muted-foreground">
            {ProjectStageLabels[stage]}
          </span>
        ) : (
          <div className="mb-2 inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="ステージを変える">
            {STAGE_STEPS.map((s, i) => {
              const on = s.stage === stage;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { if (!on) onChangeStage(s.stage); }}
                  aria-pressed={on}
                  title={`${s.key} ${STAGE_SHORT[s.stage]}`}
                  className={`min-h-tap text-sub inline-flex items-center gap-1.5 px-3 lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
                    on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="font-number">{s.key}</span>
                  {on && STAGE_SHORT[s.stage]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
