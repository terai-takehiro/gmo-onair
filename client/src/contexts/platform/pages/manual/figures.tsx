/**
 * 利用マニュアル・トップページ編 — 9つの figure
 *
 * t1・t2・t5・t6・t9 は**実際の画面コンポーネントをそのまま**描く
 * （`ManualTopPage.tsx` 側で `<FigureFrame>` が包み、操作不能にする）。
 *
 * t3（通知）・t4（検索 ⌘K）・t7（タスクハブ）・t8（本人メニュー）は
 * Radix Dialog / Portal / 内部 state を持つため static に再現する
 * （そのまま埋め込むと全画面モーダルとして飛び出し、レイアウトが壊れる）。
 * 色・角丸・文字級・アイコン・構造は本物のソースに合わせてある。
 */
import { useState } from 'react';
import {
  Bell, Check, Search, CornerDownLeft,
  FolderKanban, Building2, Clock,
  UserCheck, Inbox,
  HelpCircle, History, Plug, ArrowLeftRight, LogOut,
} from 'lucide-react';
import { APPS } from '@gmo-onair/shared/src/client/apps';
import { useAuth } from '@/contexts/platform/AuthContext';
import { UserRoleLabels } from '@/types';
import { Greeting } from '@/contexts/platform/pages/home/Greeting';
import { AppTiles, EventTiles, type TileApp } from '@/contexts/platform/pages/home/AppTiles';
import { TodayCard } from '@/contexts/platform/pages/home/TodayCard';
import { IntakeComposer } from '@/contexts/tasks/components/intake/IntakeComposer';
import { DAILY_KEYS } from '@/contexts/platform/pages/HomePage';
import { Pin } from './parts';

// ══════════════════════════════════════════════════
// t1 — 挨拶
// ══════════════════════════════════════════════════
export function GreetingFigure() {
  const { currentUser } = useAuth();
  return (
    // `FigureFrame` の内側は `width: max-content`。CJK は好きな位置で折り返せるため、
    // 幅の基準になる要素が無いと最悪1文字ずつの縦長に潰れる。**最小幅を明示して底を作る**
    <div className="min-w-[420px]">
      <Greeting
        greeting="お疲れさまです"
        userName={currentUser?.name}
        mobile={false}
        canCount
        waitingTotal={11}
        myOverdue={1}
        lastLoaded={Date.now()}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════
// t2 — アプリタイル（＋イベントで使うもの）
// ══════════════════════════════════════════════════
const TILE_BADGES: Record<string, { n: number; urgent?: boolean }> = {
  sales: { n: 10, urgent: true },
  budget: { n: 1 },
  calendar: { n: 5 },
  dailyops: { n: 1 },
};

export function AppTilesFigure() {
  const { hasPermission } = useAuth();
  const tiles: TileApp[] = APPS
    .filter((a) => DAILY_KEYS.includes(a.key))
    .filter((a) => !a.permissionModule || hasPermission(a.permissionModule))
    .map((a) => ({ ...a, badge: TILE_BADGES[a.key]?.n, urgent: TILE_BADGES[a.key]?.urgent }));
  return (
    <div className="flex min-w-[640px] flex-col gap-3.5">
      <AppTiles apps={tiles} mobile={false} />
      <EventTiles mobile={false} />
    </div>
  );
}

// ══════════════════════════════════════════════════
// t3 — お知らせ（開いた状態・static）
// ══════════════════════════════════════════════════
const NOTICES = [
  { title: '［請求書］株式会社STAND UP 宛…', time: '9時間前' },
  { title: '［未入金］株式会社STAND UP —', time: '9時間前' },
];

export function NotificationFigure() {
  return (
    <div className="rounded-card w-[320px] max-w-full overflow-hidden border border-border bg-card shadow-lg">
      <div className="flex items-center gap-2 border-b border-border-faint px-3.5 py-2.5">
        <Bell className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-cardtitle min-w-0 flex-1">お知らせ</span>
        <span className="relative inline-flex items-center gap-1 text-note text-primary">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />すべて読んだことにする
          <Pin n={2} className="absolute -right-3 -top-3" />
        </span>
      </div>
      <ul>
        {NOTICES.map((n, i) => (
          <li
            key={n.title}
            className="relative flex items-start gap-2 border-b border-border-faint bg-primary-surface-weak px-3.5 py-2.5 last:border-b-0"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-chip bg-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-sub block [overflow-wrap:anywhere]">{n.title}</span>
              <span className="text-note mt-0.5 block text-muted-foreground">{n.time}</span>
            </span>
            {i === 0 && <Pin n={1} className="absolute -right-2 -top-2" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ══════════════════════════════════════════════════
// t4 — 検索（⌘K パレット・static）
// ══════════════════════════════════════════════════
const FAVORITES = [
  { icon: FolderKanban, label: '案件をつくる', note: '案件管理' },
  { icon: Building2, label: 'お客様の一覧', note: '案件管理' },
];
const RECENTS = [
  { icon: Clock, label: 'GLS-2408-012 ○○番組 収録', note: '案件 ・ 3日前' },
];

export function SearchFigure() {
  return (
    <div className="rounded-card w-[420px] max-w-full overflow-hidden border border-border bg-card shadow-lg">
      <div className="relative flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sub flex-1 text-muted-foreground">案件・お客様・機材を探す</span>
        <Pin n={1} className="absolute -right-2 -top-2" />
      </div>
      <div className="relative p-1.5">
        <Pin n={2} className="absolute -top-2 right-1" />
        <p className="text-sub-sm px-3 pb-1 pt-2.5 font-bold text-muted-foreground">よく行く先</p>
        {FAVORITES.map((f) => (
          <div key={f.label} className="text-list flex items-center gap-2.5 rounded-control-lg px-3 py-2">
            <f.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{f.label}</span>
            <span className="text-sub-sm shrink-0 truncate text-muted-foreground">{f.note}</span>
          </div>
        ))}
        <p className="text-sub-sm px-3 pb-1 pt-2.5 font-bold text-muted-foreground">最近見たもの</p>
        {RECENTS.map((r) => (
          <div key={r.label} className="text-list flex items-center gap-2.5 rounded-control-lg px-3 py-2">
            <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="text-sub-sm shrink-0 truncate text-muted-foreground">{r.note}</span>
          </div>
        ))}
      </div>
      <div className="text-note flex items-center gap-3 border-t border-border px-4 py-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" aria-hidden="true" />開く</span>
        <span>↑↓ 選ぶ</span>
        <span>Esc 閉じる</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// t5 — 依頼・タスクの投入口
// ══════════════════════════════════════════════════
export function IntakeFigure() {
  const [demoText] = useState('山田さんに 明日18時までに 請求書の送付をお願いした');
  return (
    <div className="min-w-[420px]">
      <IntakeComposer
        text={demoText}
        onTextChange={() => {}}
        files={[]}
        onAddFiles={() => {}}
        onRemoveFile={() => {}}
        onSubmit={() => {}}
        onAudio={() => {}}
        canSubmit
        pending={false}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════
// t6 — 今日の予定
// ══════════════════════════════════════════════════
export function TodayFigure() {
  return (
    <div className="min-w-[360px]">
      <TodayCard days={[]} />
    </div>
  );
}

// ══════════════════════════════════════════════════
// t7 — 自分のタスク／お待たせ中（タスクハブ・static）
// ══════════════════════════════════════════════════
export function TaskHubFigure() {
  return (
    <section className="rounded-card w-[420px] max-w-full border border-primary-border-strong bg-card p-4">
      <div className="relative flex items-center gap-1 rounded-control-lg border border-border p-0.5">
        <span className="text-sub flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />自分のタスク
        </span>
        <span className="text-sub flex items-center gap-1.5 rounded-control bg-primary-surface px-2.5 py-1.5 font-bold text-primary">
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />お待たせ中
        </span>
        <Pin n={1} className="absolute -right-2 -top-2" />
      </div>

      <div className="mt-2.5 flex gap-2">
        <span className="rounded-control-lg min-w-0 flex-1 border border-destructive-border bg-destructive-surface px-2.5 py-1.5 text-destructive">
          <span className="font-number block text-h2 leading-tight">1</span>
          <span className="text-note block truncate">期限超過</span>
        </span>
        <span className="rounded-control-lg min-w-0 flex-1 border border-warning-border bg-warning-surface px-2.5 py-1.5 text-warning">
          <span className="font-number block text-h2 leading-tight">0</span>
          <span className="text-note block truncate">今日まで</span>
        </span>
        <span className="rounded-control-lg min-w-0 flex-1 border border-border bg-surface-subtle px-2.5 py-1.5 text-secondary-foreground">
          <span className="font-number block text-h2 leading-tight">1</span>
          <span className="text-note block truncate">返事待ちの依頼</span>
        </span>
      </div>

      <div className="relative mt-1.5 flex items-start gap-2.5 border-t border-border-subtle py-2">
        <span className="min-w-0 flex-1">
          <span className="text-sub block">NETGEARメール対応</span>
          <span className="text-note block truncate text-muted-foreground">8/3 17:00</span>
        </span>
        <span className="rounded-badge-xs inline-flex h-[22px] shrink-0 items-center bg-destructive-surface px-2 text-note font-bold text-destructive">
          超過
        </span>
        <Pin n={2} className="absolute -right-2 -top-2" />
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════
// t8 — 本人メニュー（開いた状態・static）
// ══════════════════════════════════════════════════
export function UserMenuFigure() {
  const { currentUser } = useAuth();
  const name = currentUser?.name || 'ゲスト';
  const roleLabel = currentUser?.role
    ? (UserRoleLabels[currentUser.role as keyof typeof UserRoleLabels] ?? currentUser.role)
    : '';
  return (
    <div className="rounded-card w-60 border border-border bg-card p-1.5 shadow-2xl shadow-black/10">
      <div className="border-b border-border-faint px-3 pb-2 pt-1.5">
        <p className="text-list truncate">{name}</p>
        <p className="text-sub-sm truncate text-muted-foreground">{roleLabel}</p>
      </div>
      <div>
        <span className="relative flex w-full items-center gap-2.5 rounded-control bg-primary-surface px-3 py-2 text-left text-list text-primary">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />利用マニュアル
          <Pin n={1} className="absolute -right-2 -top-2" />
        </span>
        <span className="text-list flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-foreground">
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />バージョン履歴
        </span>
        <span className="text-list flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-foreground">
          <Plug className="h-4 w-4 shrink-0" aria-hidden="true" />MCP コネクタ
        </span>
      </div>
      <span className="relative flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-list text-foreground">
        <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden="true" />ユーザー切替
        <Pin n={2} className="absolute -right-2 -top-2" />
      </span>
      <span className="text-list flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-destructive">
        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />ログアウト
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════
// t9 — イベントで使うもの（外部ツール）
// ══════════════════════════════════════════════════
export function EventTilesFigure() {
  return (
    <div className="min-w-[420px]">
      <EventTiles mobile={false} />
    </div>
  );
}
