/**
 * 「隔週キープに載せる」の印 — ふりかえりの右側（`ReviewSide.tsx`）の3枚目
 *
 * ── 何の印か ────────────────────────────────────────────────
 *
 * 隔週キープ（業績報告）の資料は、ヨミ表で印を付けた案件だけを
 * **案件ページ**（帯・写真・概要・進行表・売上／粗利の1枚）にする
 * （`docs/design/v4/keep-report.md` §3・§7）。値は `projects.keep_pick`
 * （migration 282）で、日常業務の「隔週キープの数字」タブのヨミ表の
 * 「資料」チェックと**同じ列**。営業が案件側からも付け外しできるようにここに置く。
 *
 * ── 数字は別のアプリで見る ──────────────────────────────────
 *
 * 隔週キープの数字は日常業務（`/daily/`）の週報の中にある。別バンドルなので
 * ルーターでは飛べず、素の `<a href>` で移る（`client/CLAUDE.md`「別バンドルへは素の遷移」）。
 */
import { ExternalLink, Presentation } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useSetKeepPick } from '@/lib/keepApi';

export function KeepPickCard({ projectId, keepPick, canEdit }: {
  projectId: string;
  keepPick: boolean;
  canEdit: boolean;
}) {
  const setPick = useSetKeepPick(projectId);
  const toggle = (next: boolean) => setPick.mutate(next, {
    onSuccess: () => notifySuccess(
      next ? '隔週キープに載せる案件にしました' : '隔週キープから外しました',
      { description: next ? '次の資料で案件ページになります。' : '次の資料の案件ページから外れます。' },
    ),
    onError: (e) => notifyApiError('印を変えられませんでした', e),
  });

  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
        <Presentation className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-cardtitle min-w-0 flex-1">隔週キープ</h3>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Switch
            id="keep-pick"
            checked={keepPick}
            disabled={!canEdit || setPick.isPending}
            onCheckedChange={(v) => toggle(!!v)}
          />
          <label htmlFor="keep-pick" className="text-list min-w-0 flex-1">隔週キープに載せる</label>
        </div>
        <p className="text-note text-muted-foreground">
          ヨミ表で印を付けた案件だけ、資料の案件ページになります。
        </p>
        {/* 別バンドル（日常業務）へは素の遷移。ルーターの `<Link>` では開けない */}
        <a
          href="/daily/weekly"
          className="text-sub min-h-tap inline-flex items-center gap-1.5 self-start text-primary hover:underline lg:min-h-0"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          隔週キープの数字を見る
        </a>
      </div>
    </section>
  );
}
