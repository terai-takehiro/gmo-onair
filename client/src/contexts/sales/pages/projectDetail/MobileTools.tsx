/**
 * ⑥ 案件を開く（スマホ）— 「PC で」の案内と道具
 *
 * ── モックが端末枠にはっきり書いていること ──────────────────
 *
 *   > **見積・書類・やり取りは PC で**
 *
 * これは機能を削るという話ではなく、**スマホで開いたときに
 * 「無い」ではなく「PC にある」と分かる**ようにするための1行です。
 * 書かないと、タブが3つしか無いのを見て**機能が消えたと読まれます**。
 *
 * ⚠️ **「やり取り」は外した（この回・監査で発見）。** この案内文はモックの
 * 文言のままだったが、その後 `tabs.ts` の `MOBILE_TABS_BY_PHASE` が入り
 * （「ふだん」「終わった案件」の2段階では**やり取りタブがスマホのヘッダーに
 * 出て、そのまま開ける**）、見積・書類（常に PC 専用）とは扱いが変わった。
 * 「やり取りは PC にあります」と言い切ると、実際にはタブを押せば開けるのに
 * 「無い」と誤解させる。ここでは常に PC 専用の2つだけを案内する
 *
 * ── 道具（モックの4つ） ────────────────────────────────────
 *
 * 予定を見る ／ 機材 ／ Qシート ／ BOX。
 * **押せるものだけ出します**:
 *
 *   予定を見る  `/studio/calendar`（スマホでは ⑬ 今日の予約が出る）
 *   機材        `/equipment`（別バンドル）
 *   制作資料    当日タブへ送る。**この案件の資料だけ**が並ぶので、
 *               `/qsheet` を直接開くより近い（v4 の呼び名は「制作資料」）
 *   BOX         `box_url_internal` が入っているときだけ。
 *               **無い案件では出しません** — 押しても開かないボタンを置かない
 */
import { CalendarDays, Package, FileText, FolderOpen, ExternalLink } from 'lucide-react';
import { PcOnlyNote } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { ProjectDetail } from './types';

export function MobileTools({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const tools: { key: string; label: string; sub: string; icon: typeof CalendarDays; go: () => void; ext?: boolean }[] = [];
  if (hasPermission('sales')) {
    tools.push({
      key: 'cal', label: '予定を見る', sub: '今日の予約とスタジオ', icon: CalendarDays,
      go: () => navigate('/studio/calendar'),
    });
  }
  if (hasPermission('equipment')) {
    tools.push({
      key: 'eq', label: '機材', sub: '台帳・QR・貸出', icon: Package, ext: true,
      go: () => { window.location.href = '/equipment'; },
    });
  }
  tools.push({
    key: 'qs', label: '制作資料', sub: 'この案件の台本・進行', icon: FileText,
    go: () => navigate(`/sales/projects/${project.id}/day`),
  });
  if (project.box_url_internal) {
    tools.push({
      key: 'box', label: 'BOX', sub: '社内限りのフォルダ', icon: FolderOpen, ext: true,
      go: () => window.open(project.box_url_internal!, '_blank', 'noopener,noreferrer'),
    });
  }

  return (
    <div className="flex flex-col gap-3.5 p-3 pt-0">
      <section className="flex flex-col gap-2">
        <h2 className="text-cardtitle">道具</h2>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={t.go}
              className="rounded-card min-h-tap flex flex-col items-start gap-1 border border-border bg-card p-3 text-left"
            >
              <span className="flex items-center gap-1.5">
                <t.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-list">{t.label}</span>
                {t.ext && <ExternalLink className="h-3 w-3 shrink-0 text-fg-disabled" aria-hidden="true" />}
              </span>
              <span className="text-note text-muted-foreground">{t.sub}</span>
            </button>
          ))}
        </div>
      </section>

      {/*
        帯は共通部品（`client-v4/pcOnly`）。文面と見た目を10か所に散らさない。
        **「やり取り」は含めない**（上の docstring 参照。段階によってはタブから開ける）
      */}
      <PcOnlyNote
        what="見積・書類"
        why="金額の明細は横に伸びる表、書類は BOX のフォルダで、どちらもこの幅では読み切れません。消したのではなく、PC にあります。"
      />
    </div>
  );
}
