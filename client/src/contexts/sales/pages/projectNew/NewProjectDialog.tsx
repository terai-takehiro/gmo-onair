/**
 * 案件作成 — 受付と1つにした画面（v4・migration 165/170/181）
 *
 * ── 画面を1つ減らした ───────────────────────────────────────
 *
 * 旧 `/sales/inbox`（受付）と `/sales/projects/new`（案件登録）は**同じ仕事**でした。
 * 届いたものを読んで、足りないところを埋めて、案件にするかどうかを決める。
 * 2画面に分けていたので、受付で確かめてから登録画面で**もう一度同じ項目を入れる**
 * ことになっていました。→ **1画面**にして、
 *
 *   上 … 自動で届いたもの（レール）… 選ぶと下の欄に読み取り結果が入る
 *   下 … フォーム（必須5つ ＋ 畳んだ「進んだら聞く」）
 *   上辺 … ネタのまま残す ／ 見送りにする ／ 案件にする（与件化）
 *
 * `/sales/inbox` はこの画面へ転送します（`App.tsx`）。
 *
 * ── GLS 発番の位置づけ ──────────────────────────────────────
 *
 * ボタンは「**案件にする（与件化）**」です。**GLS 番号はここで発番しません。**
 * 受注が固まった時点で案件詳細から採ります。「案件にする（GLS を発番）」という
 * 表記は使いません。
 *
 * ── 中身は PC とスマホで共通 ────────────────────────────────
 *
 * 項目そのものは `RequiredFields` / `MoreFields`、状態は `useNewProjectForm`。
 * このファイルが持つのは **PC の並べ方**だけです。
 *
 * ── 直す画面もこの項目を使います ────────────────────────────
 *
 * `/sales/projects/:id/edit`（案件を直す）は **`RequiredFields` /
 * `MoreFields` をそのまま呼びます**（`mode="edit"`）。項目を足すときは
 * `fields.ts` に足すだけで両方に出ます。**片方にだけ欄を作らないこと。**
 * 直す画面だけが持つのは、BOX の URL・申込書・番組情報・スタジオの日程・
 * 担当メンバーと、GLS の操作です。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useNewProjectForm } from './useNewProjectForm';
import { RequiredFields } from './RequiredFields';
import { moreFieldCount } from './fields';
import { MoreFields } from './MoreFields';
import { RegularSeriesSection } from './RegularSeriesSection';
import { IntakeRail } from './IntakeRail';
import { AskPanel } from './AskPanel';
import { MobileNewProject } from './MobileNewProject';

/**
 * 幅で選ぶだけの薄い親。**中で `if (mobile) return …` と書かない**
 * （幅が変わった瞬間にフックの数が変わって React が落ちる）。
 */
export default function NewProjectDialog() {
  return useIsMobile() ? <MobileNewProject /> : <DesktopNewProject />;
}

function DesktopNewProject() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const f = useNewProjectForm();
  const { v, missing, decisions } = f;
  const [more, setMore] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      {/* 上辺は**貼り付け**。下まで進むと決めるボタンが画面外になります */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-border bg-card px-4 py-3 lg:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1">案件作成</h1>
          <p className="text-note text-muted-foreground">
            自動で届いたものも、電話で聞いた話も、ここ1枚で案件にします。必須は{' '}
            <strong className="font-bold">お客様・案件名・客入れの有無・案件分類・社内の担当</strong>{' '}
            の5つだけ。<strong className="font-bold">GLS の発番は受注が固まってから</strong>です
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />やめる
        </Button>
        <Button variant="outline" onClick={decisions.keep} disabled={decisions.busy || missing.length > 0}>
          ネタのまま残す
        </Button>
        {/* **見送りは押せるときだけ出す。** 手で入れている途中は消す対象が無い */}
        {decisions.canDrop && (
          <Button
            variant="outline"
            onClick={decisions.drop}
            disabled={decisions.busy}
            className="border-destructive-border text-destructive hover:bg-destructive-surface"
          >
            見送りにする
          </Button>
        )}
        <Button onClick={decisions.promote} disabled={missing.length > 0 || decisions.busy}>
          {decisions.busy
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
          案件にする（与件化）
        </Button>
      </div>

      <div className="flex flex-col gap-3.5 p-4 lg:px-6 lg:pb-6">
        <IntakeRail items={f.items} total={f.itemsTotal} selectedKey={f.selected?.key ?? null} onSelect={f.setSelected} />

        {f.selection?.project?.gls_number && (
          <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2 text-sub text-warning">
            この案件はすでに GLS <strong className="font-bold">{f.selection.project.gls_number}</strong> を
            発番しています。ここから直すのではなく、案件詳細を開いてください。
          </p>
        )}

        {/* **足りない項目を名指しする。** 押せないボタンだけだと何が足りないか探すことになる。
            ⚠️ **文面はボタンと同じ言い方にそろえる**（ご指示）。モックはここだけ
            「まだつくれません」だが、モック自身のボタンは「案件にする（与件化）」で、
            **できないと言われている操作と、押すボタンの名前が違う**状態だった */}
        {missing.length > 0 && (
          <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2 text-sub text-warning">
            {missing.join(' ・ ')} が入っていないので、まだ案件にできません
          </p>
        )}

        <div className="rounded-card border border-primary-border bg-card px-4 py-4 lg:px-5">
          <p className="text-cardtitle mb-3">いま必要な5つ</p>
          <RequiredFields f={f} />
        </div>

        <div className="rounded-card overflow-hidden border border-border bg-card">
          <button
            type="button"
            onClick={() => setMore((o) => !o)}
            aria-expanded={more}
            className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted"
          >
            {more
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className="text-list font-bold">進んだら聞く</span>
            <span className="text-badge font-number rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
              {moreFieldCount(v.audience)}
            </span>
            <span className="flex-1" />
            <span className="text-note text-muted-foreground">あとから足せます</span>
          </button>

          {more && (
            <div className="border-t border-border-faint px-4 pb-4 pt-4 lg:px-5">
              <MoreFields f={f} />
            </div>
          )}
        </div>

        {/* 回を作るたびに聞かれては困る4つの取り決め（regular-series.md §3）を、
            案件作成の時点でも入れられるようにする */}
        <RegularSeriesSection f={f} />

        {/* 受付から持ち込んだ「聞くこと」と「聞き方の下書き」 */}
        <AskPanel v={v} customerName={f.customer?.name ?? null} senderName={currentUser?.name ?? ''} />
      </div>
    </div>
  );
}
