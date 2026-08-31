// テロップCG — 部品ライブラリ（`/techops/graphics/:ownerKey/parts`・モック⑤）。
//
// 部品ライブラリは**全番組共通のカタログ**（docs/design/v4/graphics.md §2）で、
// owner（案件/番組）に紐づくデータを持たない。URL だけ既存の
// `/techops/graphics/:ownerKey/...` の並びに揃え、`ownerKey` は「ハブへ戻る」
// リンクの組み立てにだけ使う（`useGraphicsProject` は呼ばない）。
//
// 段4（graphics.md §9）の入口部分だけ — 読み取り専用のカタログ表示。
// 「新しい部品をリクエスト」はモックにある導線をそのまま置くが、リクエスト画面は
// まだ無いため押しても未実装トーストのみ（実装が無いのに動くふりをしない）。
// 「組み合わせてテンプレートを作る」は段6-2でテンプレート管理画面
// （`TemplateManagerPage.tsx`）ができたので、そちらへ遷移する。
import { Link, useParams } from 'react-router-dom';
import { Blocks, ChevronLeft, Info, Lightbulb, ListChecks, Plug, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifyInfo } from '@/lib/notify';
import { PART_DEFAULT_SLOT } from '@/lib/graphicsApi';
import { SlotBadge } from './badges';
import { PART_LIBRARY_CARDS } from './partLibraryData';

export default function PartLibraryPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const hubPath = `/techops/graphics/${encodeURIComponent(ownerKey ?? '')}`;
  const templatesPath = `/techops/graphics/${encodeURIComponent(ownerKey ?? '')}/templates`;

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={hubPath}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        テロップCG ハブへ戻る
      </Link>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">部品ライブラリ</h1>
          <p className="mt-1 text-sub text-muted-foreground">
            {PART_LIBRARY_CARDS.length} 部品 ・ どの番組からも同じものを使います（部品の改良は全番組に効きます）
          </p>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={() => notifyInfo('部品のリクエストはこれから作ります（発注と同じくスマホからも出せる形にする予定です）')}
        >
          <Lightbulb className="mr-1 h-4 w-4 text-warning" aria-hidden="true" />新しい部品をリクエスト
        </Button>
        <Button asChild>
          <Link to={templatesPath}>
            <Blocks className="mr-1 h-4 w-4" aria-hidden="true" />組み合わせてテンプレートを作る
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PART_LIBRARY_CARDS.map((c) => (
          <PartCard key={c.partKey} card={c} />
        ))}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-note border border-warning-border bg-warning-surface px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sub leading-relaxed text-foreground">
          部品は<strong className="font-bold">足すたびに全番組の資産</strong>になります。テンプレートは部品の組み合わせ＋テーマ（色・ロゴ・書体）＋公開フィールドの絞り込みで、ゼロから描く場所ではありません。新しい表現が要るときだけ部品そのものを開発します（HTML/CSS・社内で保守）。
        </p>
      </div>
    </div>
  );
}

function PartCard({ card }: { card: (typeof PART_LIBRARY_CARDS)[number] }) {
  const Icon = card.icon;
  const slot = PART_DEFAULT_SLOT[card.partKey];
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-[#1b1f2a] to-[#12141b]">
        <Icon className="h-9 w-9 text-white/25" aria-hidden="true" />
        <span className="absolute right-2 top-2">
          <SlotBadge slot={slot} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-list font-bold">{card.name}</span>
          <span className="font-number shrink-0 text-note text-muted-foreground">{card.used}</span>
        </div>
        <p className="text-note leading-relaxed text-muted-foreground">{card.desc}</p>
        <div className="mt-auto flex flex-wrap gap-1.5">
          <Chip icon={<ListChecks className="h-2.5 w-2.5" aria-hidden="true" />} label={card.fields} />
          <Chip icon={<SlidersHorizontal className="h-2.5 w-2.5" aria-hidden="true" />} label={card.ctl} tone="accent" />
          <Chip icon={<Plug className="h-2.5 w-2.5" aria-hidden="true" />} label={card.data} tone="info" />
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, tone = 'neutral' }: { icon: React.ReactNode; label: string; tone?: 'neutral' | 'accent' | 'info' }) {
  const cls = {
    neutral: 'bg-surface-subtle text-muted-foreground',
    accent: 'bg-warning-surface text-warning',
    info: 'bg-info-surface text-info',
  }[tone];
  return (
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-control px-1.5 text-[10px] font-bold ${cls}`}>
      {icon}{label}
    </span>
  );
}
