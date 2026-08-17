/**
 * 案件作成（スマホ・3段組み）
 *
 * ── なぜ段に分けるのか ──────────────────────────────────────
 *
 * PC は1枚ものです。375px で縦に積むと入力欄が続く長い巻物になり、
 * **どこまで入れたか分からなくなります**。指示書のとおり3段に切ります:
 *
 *   1 / 3  **いま必要**（必須5つ）… 頭に「自動で届いたもの」のレールを置く
 *   2 / 3  **進んだら聞く**（あとから足せるもの）
 *   3 / 3  **最初のタスク**（＋ 聞くこと）
 *
 * ── レールは1段目の頭 ───────────────────────────────────────
 *
 * 受付を畳んだ先がこの画面なので、**届いたものはいちばん最初に見える**必要があります。
 * 2段目以降に置くと、案件にする前に読むものが1タップ奥に隠れます。
 *
 * ── 中身は PC と同じ部品 ────────────────────────────────────
 *
 * 項目は `RequiredFields` / `MoreFields`、状態は `useNewProjectForm`、
 * 送るのは `useProjectDecisions`。**このファイルが持つのは段の切り方だけ**です。
 * 写すと、列が増えたとき片方だけ送らなくなり、引き合いへの書き戻しも片方だけ忘れます
 * （忘れると未仕分けに残り、**同じ引き合いから案件が2件**できる）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useNewProjectForm } from './useNewProjectForm';
import { RequiredFields } from './RequiredFields';
import { MoreFields } from './MoreFields';
import { IntakeRail } from './IntakeRail';
import { AskPanel } from './AskPanel';

const STEPS = ['いま必要', '進んだら聞く', '最初のタスク'];

export function MobileNewProject() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const f = useNewProjectForm();
  const { v, set, missing, decisions } = f;
  const [step, setStep] = useState(0);

  /** その段で足りないもの。**1段目にしか必須は無い** */
  const stepMissing = step === 0 ? missing : [];
  const last = step === STEPS.length - 1;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-h1 min-w-0 flex-1">案件作成</h1>
          <span className="text-note font-number shrink-0 text-muted-foreground">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        {/* 進み具合は棒で出す。**段の名前だけだと、あと何段あるか分からない** */}
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <p className="text-note mt-1.5 text-muted-foreground">{STEPS[step]}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4 pb-2">
        {step === 0 && (
          <>
            <IntakeRail items={f.items} total={f.itemsTotal} selectedKey={f.selected?.key ?? null} onSelect={f.setSelected} />
            {stepMissing.length > 0 && (
              <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-sub text-warning">
                {stepMissing.join(' ・ ')} が入っていません
              </p>
            )}
            <RequiredFields f={f} />
          </>
        )}

        {step === 1 && <MoreFields f={f} />}

        {step === 2 && (
          <>
            <div>
              <Label htmlFor="mnp-task">最初のタスク</Label>
              <Input
                id="mnp-task" className="mt-1"
                value={v.first_task_title}
                onChange={(e) => set('first_task_title', e.target.value)}
                placeholder="見積を送る"
              />
              <p className="text-note mt-1 text-muted-foreground">
                入れなくても大丈夫です。あとから案件詳細で足せます
              </p>
            </div>

            <div>
              <Label htmlFor="mnp-due">期限</Label>
              <Input
                id="mnp-due" className="mt-1" type="date"
                value={v.first_task_due}
                onChange={(e) => set('first_task_due', e.target.value)}
              />
              <p className="text-note mt-1 text-muted-foreground">日付だけ入れると 18:00 になります</p>
            </div>

            <AskPanel v={v} customerName={f.customer?.name ?? null} senderName={currentUser?.name ?? ''} />

            {missing.length > 0 && (
              <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-sub text-warning">
                {missing.join(' ・ ')} が入っていないので、まだ案件にできません
              </p>
            )}
          </>
        )}
      </div>

      {/*
        下端に貼り付け。**主役は「次へ」と「案件にする」**なので、
        見送り・ネタのまま残すはその上の行に置きます
        （消しません — 押せる場所が無くなると受付でできていたことができなくなる）。
      */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-card px-4 py-3">
        {last && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={decisions.keep} disabled={decisions.busy || missing.length > 0}>
              ネタのまま残す
            </Button>
            {decisions.canDrop && (
              <Button
                variant="outline"
                className="flex-1 border-destructive-border text-destructive"
                onClick={decisions.drop}
                disabled={decisions.busy}
              >
                見送りにする
              </Button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
            aria-label={step === 0 ? 'やめる' : '前へ'}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          {last ? (
            // **スマホは「つくる」1語**（モック）。PC の見出しボタンは
            // 「案件にする（与件化）」だが、375px の下端ボタンでは長い —
            // 与件化の意味はこの前の画面（進んだら聞く・最初のタスク）で
            // 十分に伝わっている
            <Button className="flex-1" onClick={decisions.promote} disabled={missing.length > 0 || decisions.busy}>
              {decisions.busy
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
              つくる
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => setStep((s) => s + 1)} disabled={stepMissing.length > 0}>
              次へ<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
