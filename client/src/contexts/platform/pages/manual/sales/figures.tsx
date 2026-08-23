/**
 * 利用マニュアル・案件管理編 — 11個の figure
 *
 * ここに描く画面（ログイン・案件一覧・見積明細・カンバン・財務ダッシュボード等）は
 * `../figures.tsx`（トップページ編）と違い、**実際の画面コンポーネントを import できる
 * ものが無い**（フォーム・表・ボード状の複合画面で、props 駆動の再利用可能な単体部品に
 * 切り出されていないか、切り出し調査が実装コストに見合わない）。そのため
 * `../parts.tsx` の方針どおり、**トークン・クラス構造だけで static に再現する**。
 *
 * `FigureFrame`（呼び出し側の `SalesManualPage.tsx` が包む）が
 * `pointer-events-none select-none` を掛けるので、ここでは実際の送信・遷移が
 * 起きない前提で `Input` 等の見た目だけを borrow してよい。
 */
import type { ReactNode } from 'react';
import { Search, PlusCircle, Link2, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@/lib/utils';

// ══════════════════════════════════════════════════
// 共通の小部品（この figure 群の中だけで使う）
// ══════════════════════════════════════════════════

/** タブ・ウィザードの chip 列。1つだけ `active` にする */
function TabRow({ tabs }: { tabs: { label: string; active?: boolean }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {tabs.map((t) => (
        <span
          key={t.label}
          className={cn(
            'rounded-chip shrink-0 whitespace-nowrap px-3 py-1.5 text-sub',
            t.active
              ? 'bg-primary font-bold text-primary-foreground'
              : 'border border-border bg-card text-muted-foreground',
          )}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

/** フォームの1欄。`highlight` は「いまここが注目」を淡い枠で示す */
function Field({ label, placeholder, highlight }: { label: string; placeholder: string; highlight?: boolean }) {
  return (
    <label
      className={cn(
        'flex flex-col gap-1 rounded-control-lg p-1.5',
        highlight && 'border border-primary-border bg-primary-surface-weak',
      )}
    >
      <span className="text-note text-muted-foreground">{label}</span>
      <Input placeholder={placeholder} readOnly tabIndex={-1} />
    </label>
  );
}

/** 画面の中に置く案内帯（ページ本体側の `TipCallout` とは別。figure の中身の一部） */
function MiniBanner({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const cls = tone === 'warning'
    ? 'border-warning-border bg-warning-surface text-warning'
    : 'border-info-border bg-info-surface text-info';
  return <p className={cn('rounded-note text-sub border px-3 py-2', cls)}>{children}</p>;
}

/** メニュー1行（GLS発番の「新規番組／既存案件に追加」） */
function MenuRow({
  icon: Icon, label, note, highlight,
}: { icon: LucideIcon; label: string; note: string; highlight?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-control-lg px-3 py-2.5', highlight && 'bg-primary-surface')}>
      <Icon className={cn('h-4 w-4 shrink-0', highlight ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={cn('text-list block', highlight && 'font-bold text-primary')}>{label}</span>
        <span className="text-sub-sm block text-muted-foreground">{note}</span>
      </span>
    </div>
  );
}

/** 簡易テーブルの見出し行 */
function TableHead({ cols }: { cols: string[] }) {
  return (
    <tr className="border-b border-border-faint bg-surface-subtle">
      {cols.map((c) => (
        <th key={c} className="text-th whitespace-nowrap px-3 py-2 text-left font-bold text-muted-foreground">{c}</th>
      ))}
    </tr>
  );
}

// ══════════════════════════════════════════════════
// g1-1 — ログイン（招待URL→ログイン→SMS）
// ══════════════════════════════════════════════════
export function LoginFigure() {
  return (
    <div className="flex min-w-[380px] flex-col gap-4">
      <TabRow tabs={[{ label: '① 招待URL', active: true }, { label: '② ログイン' }, { label: '③ SMS認証' }]} />
      <div className="flex flex-col gap-3">
        <Field label="メールアドレス" placeholder="you@example.com" />
        <Field label="パスワード" placeholder="••••••••" highlight />
        <Field label="認証コード（6桁）" placeholder="123456" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g1-4 — 案件のステージ
// ══════════════════════════════════════════════════
export function StageFigure() {
  return (
    <div className="flex min-w-[520px] flex-col gap-3">
      <TabRow
        tabs={[
          { label: 'ネタ' }, { label: 'D仮押さえ' }, { label: 'C見積提案済' },
          { label: 'B口頭決定' }, { label: 'A受注済', active: true }, { label: 'S案件終了' },
        ]}
      />
      <MiniBanner>途中のどのステージからでも「E 失注」に進めます。</MiniBanner>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g2-1 — 案件を探す・絞り込む
// ══════════════════════════════════════════════════
export function ProjectSearchFigure() {
  return (
    <div className="flex min-w-[640px] flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input placeholder="案件名・コード・顧客名で検索" readOnly tabIndex={-1} className="pl-9" />
      </div>
      <TabRow tabs={[{ label: '全て', active: true }, { label: 'アクティブ' }, { label: 'ヨミ' }, { label: '進行中' }]} />
      <div className="overflow-hidden rounded-card border border-border-faint">
        <table className="w-full border-collapse">
          <thead>
            <TableHead cols={['GLS番号', '案件名', '顧客', 'ステージ', '開催日', '金額']} />
          </thead>
          <tbody>
            <tr className="border-b border-border-faint">
              <td className="text-sub whitespace-nowrap px-3 py-2">GLS0123</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">○○発表会2026</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">株式会社Example</td>
              <td className="px-3 py-2"><TableBadge label="A受注済" variant="success" w={null} /></td>
              <td className="text-sub whitespace-nowrap px-3 py-2">2026-08-10</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">¥3,200,000</td>
            </tr>
            <tr>
              <td className="text-sub whitespace-nowrap px-3 py-2">（未発番）</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">△△イベント（ヨミ）</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">株式会社Sample</td>
              <td className="px-3 py-2"><TableBadge label="C見積提案済" variant="warning" w={null} /></td>
              <td className="text-sub whitespace-nowrap px-3 py-2">2026-09-01</td>
              <td className="text-sub whitespace-nowrap px-3 py-2">¥1,500,000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g2-2 — 新しい案件を登録する
// ══════════════════════════════════════════════════
export function ProjectNewFigure() {
  return (
    <div className="grid min-w-[480px] grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="案件名 *" placeholder="○○発表会2026" highlight />
      <Field label="顧客 *" placeholder="株式会社Example" />
      <Field label="案件種類" placeholder="収録／生放送 等" />
      <Field label="想定金額（税別）" placeholder="¥3,000,000" />
      <Field label="グループ区分" placeholder="外販／グループ内" />
    </div>
  );
}

// ══════════════════════════════════════════════════
// g2-4 — スタジオ予約を紐づける
// ══════════════════════════════════════════════════
export function StudioScheduleFigure() {
  return (
    <div className="flex min-w-[480px] flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="使用する部屋・空間" placeholder="Aスタジオ" highlight />
        <Field label="本番日" placeholder="2026-09-01" />
        <Field label="リハーサル日" placeholder="2026-08-31" />
      </div>
      <MiniBanner>保存すると、この日程でスタジオ予約が自動作成されます</MiniBanner>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g2-6 — GLS番号を発番する
// ══════════════════════════════════════════════════
export function GlsIssueFigure() {
  return (
    <div className="flex min-w-[420px] flex-col gap-3">
      <div className="rounded-card border border-border-subtle bg-card p-1.5">
        <MenuRow icon={PlusCircle} label="＋新規番組" note="新しいGLS番号を発番" highlight />
        <MenuRow icon={Link2} label="既存案件に追加" note="エピソード（話数）追加" />
      </div>
      <MiniBanner>スタジオ案件は「番組種別」「配信媒体」の選択が必須です</MiniBanner>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g3-1 — 見積書・請求書の明細
// ══════════════════════════════════════════════════
export function BillingLineFigure() {
  return (
    <div className="min-w-[640px] overflow-hidden rounded-card border border-border-faint">
      <table className="w-full border-collapse">
        <thead>
          <TableHead cols={['内容', 'カテゴリ', '数量', '単価', '金額', '']} />
        </thead>
        <tbody>
          <tr className="border-b border-border-faint">
            <td className="text-sub whitespace-nowrap px-3 py-2">スタジオ利用料</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">スタジオ費</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">1</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">¥300,000</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">¥300,000</td>
            <td className="px-3 py-2"><TableBadge label="見積書" w={null} /></td>
          </tr>
          <tr className="bg-primary-surface-weak">
            <td className="text-sub whitespace-nowrap px-3 py-2">撮影機材一式</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">機材費</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">1</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">¥120,000</td>
            <td className="text-sub whitespace-nowrap px-3 py-2">¥120,000</td>
            <td className="px-3 py-2"><TableBadge label="請求書" w={null} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g4-1 — タスクのカンバン
// ══════════════════════════════════════════════════
function KanbanColumn({
  title, highlight, cards,
}: { title: string; highlight?: boolean; cards: { title: string; note: string }[] }) {
  return (
    <div
      className={cn(
        'flex min-w-[170px] flex-col gap-2 rounded-card border p-2.5',
        highlight ? 'border-primary-border bg-primary-surface-weak' : 'border-border-subtle bg-surface-subtle',
      )}
    >
      <p className="text-sub-sm font-bold text-muted-foreground">{title}</p>
      {cards.map((c) => (
        <div key={c.title} className="rounded-control-lg border border-border-faint bg-card px-2.5 py-2">
          <p className="text-sub">{c.title}</p>
          <p className="text-note text-muted-foreground">{c.note}</p>
        </div>
      ))}
    </div>
  );
}

export function TaskKanbanFigure() {
  return (
    <div className="flex min-w-[600px] flex-col gap-3">
      <TabRow tabs={[{ label: 'カンバン', active: true }, { label: 'リスト' }, { label: 'ガント' }]} />
      <div className="grid grid-cols-3 gap-3">
        <KanbanColumn
          title="進行中"
          highlight
          cards={[{ title: '台本作成', note: '担当: 山田' }, { title: '機材手配', note: '期日 8/28' }]}
        />
        <KanbanColumn title="確認待ち" cards={[{ title: '先方確認', note: '期日 8/30' }]} />
        <KanbanColumn title="完了" cards={[{ title: '会場予約', note: '済' }]} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g6-1 — 財務ダッシュボード
// ══════════════════════════════════════════════════
function KpiTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-card border p-3', highlight ? 'border-primary-border bg-primary-surface' : 'border-border-subtle bg-card')}>
      <p className="text-note text-muted-foreground">{label}</p>
      <p className={cn('font-number text-h2', highlight && 'text-primary')}>{value}</p>
    </div>
  );
}

export function FinanceDashboardFigure() {
  return (
    <div className="flex min-w-[560px] flex-col gap-3">
      <TabRow tabs={[{ label: '月', active: true }, { label: '四半期' }, { label: '年' }, { label: '期間指定' }]} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile label="売上" value="¥25.6M" highlight />
        <KpiTile label="仕入（変動原価）" value="¥16.7M" />
        <KpiTile label="粗利（限界利益）" value="¥8.9M" />
        <KpiTile label="営業利益" value="¥3.2M" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g8-1 — カレンダー（週）
// ══════════════════════════════════════════════════
const BADGE_TONE: Record<string, string> = {
  destructive: 'bg-destructive-surface text-destructive',
  primary: 'bg-primary-surface text-primary',
  muted: 'bg-muted text-muted-foreground',
};

const WEEK_DAYS: { label: string; today?: boolean; badge?: { text: string; tone: string } }[] = [
  { label: '月', badge: { text: '本番', tone: 'destructive' } },
  { label: '火' },
  { label: '水', today: true, badge: { text: 'リハ', tone: 'primary' } },
  { label: '木' },
  { label: '金', badge: { text: '仮押さえ', tone: 'muted' } },
  { label: '土' },
  { label: '日' },
];

export function CalendarWeekFigure() {
  return (
    <div className="flex min-w-[560px] flex-col gap-3">
      <TabRow tabs={[{ label: '月' }, { label: '週', active: true }, { label: '一覧' }, { label: '香盤' }]} />
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_DAYS.map((d) => (
          <div
            key={d.label}
            className={cn(
              'flex min-h-[64px] flex-col gap-1 rounded-control-lg border p-1.5',
              d.today ? 'border-primary-border bg-primary-surface' : 'border-border-subtle bg-card',
            )}
          >
            <span className="text-sub-sm text-muted-foreground">{d.label}</span>
            {d.badge && (
              <span className={cn('rounded-badge-xs px-1.5 py-0.5 text-note font-bold', BADGE_TONE[d.badge.tone])}>
                {d.badge.text}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// g8-2 — 予約の登録・編集
// ══════════════════════════════════════════════════
export function ReservationFormFigure() {
  return (
    <div className="grid min-w-[480px] grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="タイトル" placeholder="○○発表会2026 本番" highlight />
      <Field label="予約種別" placeholder="本番／リハーサル 等" />
      <Field label="スタジオ・部屋" placeholder="Aスタジオ" />
      <Field label="開始" placeholder="2026-09-01 09:00" />
      <Field label="終了" placeholder="2026-09-01 18:00" />
    </div>
  );
}
