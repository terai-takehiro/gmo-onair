/**
 * ウィークリー活動報告 — タブの列（この週の報告 ／ 隔週キープの数字 ／ 資料をつくる）
 *
 * URL で切り替える（`/weekly/:id` ・ `/weekly/:id/keep` ・ `/weekly/:id/deck`）。
 * 案件詳細（`client/src/contexts/sales/pages/projectDetail/DetailHeader.tsx`）と同じ形:
 * **均等割り**で横スクロールにしない（スクロールすると右のタブに気づけない）。
 * スマホは短い名前（この週／数字／資料）。「資料をつくる」は PC 専用の宣言があるので、
 * スマホで押すとシェルの案内（`PcOnlyGate`）に着く。
 */
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, FileOutput, Table2 } from 'lucide-react';

export type WeeklyTab = 'report' | 'keep' | 'deck';

const TABS: Array<{ key: WeeklyTab; label: string; short: string; icon: React.ElementType; suffix: string }> = [
  { key: 'report', label: 'この週の報告', short: 'この週', icon: CalendarCheck, suffix: '' },
  { key: 'keep', label: '隔週キープの数字', short: '数字', icon: Table2, suffix: '/keep' },
  { key: 'deck', label: '資料をつくる', short: '資料', icon: FileOutput, suffix: '/deck' },
];

export function WeeklyTabs({ reportId, tab, isMobile }: { reportId: string; tab: WeeklyTab; isMobile: boolean }) {
  // 数字・資料のタブは `?meeting=YYYY-MM-DD` で会議日を持つ。タブを渡り歩いても同じ会議日のまま —
  // 落とすと行き先が週から会議日を導き直し、凍結した過去の数字を見ていたのに別の会議日の構成を開く／作る
  const [params] = useSearchParams();
  const meeting = params.get('meeting');
  const search = meeting && /^\d{4}-\d{2}-\d{2}$/.test(meeting) ? `?meeting=${meeting}` : '';
  return (
    <nav aria-label="ウィークリー活動報告の区分" className="flex h-11 border-b border-border">
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <Link
            key={t.key}
            to={`/weekly/${reportId}${t.suffix}${t.key === 'report' ? '' : search}`}
            aria-current={on ? 'page' : undefined}
            className={`text-list -mb-px inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-1 lg:flex-none lg:px-4 ${
              on ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{isMobile ? t.short : t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
