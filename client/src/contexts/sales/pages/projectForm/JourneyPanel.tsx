// ジャーニー (現在地 + 次の一手1つ) — v2.9.292 で ProjectFormPage.tsx から切り出し。
// **中身は 1 行も変えていない** (移動 + export のみ)。
import { useState } from 'react';
import { Check, ChevronRight, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProjectStageColors, type ProjectStage } from '@/types';
import { JOURNEY_STAGES, JOURNEY_SHORT, NEXT_STAGE_LABEL } from './types';

/**
 * ジャーニー (7a) — 6段の現在地を日付つきで出し、**次の一手を1つだけ**主ボタンにする。
 * 他のステージは「ほかのステージ」に畳む (選択肢を10個並べると人は選べない)。
 * 失注は本線から外れた終端として別扱い。
 */
export default function JourneyPanel({
  currentStage, project, disabled, onGoStage, onOpenLost,
}: {
  currentStage: ProjectStage;
  project: Record<string, unknown> | undefined;
  disabled: boolean;
  onGoStage: (stage: ProjectStage) => void;
  onOpenLost: () => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);

  if (currentStage === 'e_lost') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-destructive">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          失注
        </p>
        <p className="mt-1 text-[13px] text-foreground">
          この案件は失注として終わっています。本線には戻せますが、学びだけ残すのが基本です。
        </p>
        <button
          type="button"
          className="mt-2 text-[13px] text-primary hover:underline"
          onClick={() => setOtherOpen((v) => !v)}
        >
          ほかのステージに戻す
        </button>
        {otherOpen && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {JOURNEY_STAGES.map((st) => (
              <Button key={st} type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => onGoStage(st)}>
                {JOURNEY_SHORT[st]}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const curIdx = JOURNEY_STAGES.indexOf(currentStage);
  const next = NEXT_STAGE_LABEL[currentStage];
  // 各段の日付 (分かるものだけ)。ネタ=作成日 / 受注・完了=実施日
  const dateOf = (st: ProjectStage): string | null => {
    const d = (k: string) => {
      const v = project?.[k];
      return typeof v === 'string' && v ? v.slice(0, 10) : null;
    };
    if (st === 'neta') return d('created_at');
    if (st === 'a_won' || st === 's_completed') return d('event_start');
    return null;
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto px-3 py-2.5">
        <ol className="flex min-w-max items-center gap-1">
          {JOURNEY_STAGES.map((st, i) => {
            const done = i < curIdx;
            const current = i === curIdx;
            const dt = dateOf(st);
            return (
              <li key={st} className="flex items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      current ? "ring-2 ring-offset-1" : "",
                      done || current ? "text-white" : "bg-secondary text-muted-foreground"
                    )}
                    style={done || current ? { backgroundColor: ProjectStageColors[st] } : undefined}
                  >
                    {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className={cn("block text-[12px]", current ? "font-bold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                      {JOURNEY_SHORT[st]}
                    </span>
                    {dt && <span className="block text-[11px] tabular-nums text-muted-foreground">{dt}</span>}
                  </span>
                </div>
                {i < JOURNEY_STAGES.length - 1 && (
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", i < curIdx ? "text-foreground/40" : "text-muted-foreground/30")} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-divider px-3 py-2.5">
        <p className="min-w-0 flex-1 text-[13px] text-foreground">{next?.note ?? 'この案件は完了しています。'}</p>
        {next && (
          <Button type="button" size="sm" className="h-9 shrink-0" disabled={disabled} onClick={() => onGoStage(next.to)}>
            {next.label}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => setOtherOpen((v) => !v)}>
          ほかのステージ
        </Button>
      </div>

      {otherOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-divider px-3 py-2.5">
          {JOURNEY_STAGES.filter((st) => st !== currentStage).map((st) => (
            <Button key={st} type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => onGoStage(st)}>
              {JOURNEY_SHORT[st]}
            </Button>
          ))}
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive-surface"
            onClick={onOpenLost}
          >
            失注にする
          </Button>
        </div>
      )}
    </div>
  );
}