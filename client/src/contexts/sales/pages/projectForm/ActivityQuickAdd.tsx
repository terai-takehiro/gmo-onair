// やり取りの記録 (この場で1件だけ) — v2.9.292 で ProjectFormPage.tsx から切り出し。
// **中身は 1 行も変えていない** (移動 + export のみ)。
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { humanizeError } from '@gmo-onair/shared/src/client/states';

/**
 * やり取りをこの場で記録する (7a)。営業活動ページに飛ばさない —
 * 飛ばすと戻ってこないので、案件の文脈のまま1件残せるようにする。
 * 既存の POST /activity-logs をそのまま使う (新規APIなし)。
 */
export default function ActivityQuickAdd({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("email");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () =>
      api.post("/activity-logs", {
        project_id: projectId,
        activity_type: kind,
        activity_date: new Date().toISOString().slice(0, 10),
        subject: subject.trim(),
        description: detail.trim() || undefined,
        next_action: nextAction.trim() || undefined,
        next_action_date: nextAction.trim() ? nextDate || undefined : undefined,
      }),
    onSuccess: () => {
      setSubject(""); setDetail(""); setNextAction(""); setNextDate(""); setErr(null); setOpen(false);
      onDone();
    },
    onError: (e: unknown) => setErr(humanizeError(e).cause),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-ctl-3 flex w-full items-center gap-2 rounded-control border border-border bg-secondary/40 px-3 text-left text-[13px] text-secondary-foreground transition-colors hover:bg-secondary"
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        ここにやり取りを書くと、この案件の記録として残ります（次にやることもここで決められます）
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-control border border-primary/30 bg-accent/30 p-3">
      <div className="flex flex-wrap gap-1.5">
        {([["email", "メール"], ["call", "電話"], ["meeting", "打合せ"], ["visit", "訪問"], ["other", "その他"]] as const).map(([v, lbl]) => (
          <button
            key={v}
            type="button"
            onClick={() => setKind(v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              kind === v ? "border-primary bg-primary font-bold text-primary-foreground" : "border-border bg-card text-secondary-foreground hover:bg-secondary"
            )}
          >
            {lbl}
          </button>
        ))}
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="何があったか (例: 見積の相談を受けた)" className="h-9" />
      <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="くわしく (任意)" className="text-[13px]" />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
        <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="次にやること (任意)" className="h-9" />
        <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-9" aria-label="次にやることの期限" />
      </div>
      {err && <p className="text-[12px] text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-9" disabled={!subject.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          記録する
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { setOpen(false); setErr(null); }}>
          やめる
        </Button>
        <span className="text-[12px] text-muted-foreground">期限は「何月何日」で入れてください。</span>
      </div>
    </div>
  );
}