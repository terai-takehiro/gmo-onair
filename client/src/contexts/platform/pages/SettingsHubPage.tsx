/**
 * 設定トップ（v4・モックの ①）
 *
 * ── 旧「システム設定」から変えたこと ────────────────────────
 *
 * 旧画面はアプリのバージョンと **Excel のバックアップ**が置いてあるだけで、
 * 「設定」を探しに来た人が欲しいもの（拠点・料金表・権限）へは行けませんでした。
 * それらは左メニューの別々の場所にあり、**どこにあるか知っている人しか辿り着けません**。
 *
 * v4 はモックのとおり **設定の入口を1枚にまとめた案内板**にします。
 *
 * ── まだ無いものも並べる ────────────────────────────────────
 *
 * お金のルール / 休日・営業時間 / 知らせと文面は**まだ画面がありません**。
 * 消すと「設定にそんな項目は無い」と読まれ、押せるように置くと壊れて見えます。
 * **並べたうえで押せなくし、何が足りないかを書きます**（`settings/hubCards.ts`）。
 *
 * ── 「直せるのは誰か」を先に書く ────────────────────────────
 *
 * 設定は権限の分かれ方が細かく、**押してから 403 で気づく**ことが多い場所です。
 * カードに「直せるのは◯◯」と書いておけば、押す前に分かります。
 *
 * ── スマホでは PC 向きのカードを出さない（M6）────────────────
 *
 * **この画面はメニューです。** 左メニューから消した項目をここに残すと、
 * 押した先で「PC で触る画面です」と言われるだけの札が並びます。
 * 落とす一覧は左メニューと**同じ表**（`@/pcOnlyScreens` の `hidden: true`）から取ります
 * — 2つに分けると、片方だけ直したときに食い違います。
 */
import { Link } from 'react-router-dom';
import { Info, Lock } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useAuth } from '@/contexts/platform/AuthContext';
import { CLIENT_MOBILE_HIDDEN } from '@/pcOnlyScreens';
import { HUB_GROUPS, type HubCard } from './settings/hubCards';
import { SettingsHubList } from './settings/SettingsHubList';

function Card({ c }: { c: HubCard }) {
  const Icon = c.icon;
  const body = (
    <>
      <span className="flex items-start gap-3">
        <span className={cn('rounded-control-lg inline-flex h-9 w-9 shrink-0 items-center justify-center', c.tone)}>
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-cardtitle block">{c.title}</span>
          <span className="text-note mt-0.5 block text-muted-foreground">{c.desc}</span>
        </span>
        {!c.to && <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="これから作ります" />}
      </span>
      {c.to ? (
        <span className="text-note mt-2.5 block text-muted-foreground">編集できるのは {c.who}</span>
      ) : (
        <span className="text-note mt-2.5 block text-warning">
          <strong className="font-bold">これから作ります。</strong>
          {c.todo?.replace(/\*\*/g, '')}
        </span>
      )}
    </>
  );

  const cls = 'rounded-card block border p-4 text-left';
  if (!c.to) {
    return <div className={cn(cls, 'border-border bg-surface-subtle')} aria-disabled="true">{body}</div>;
  }
  return (
    <Link to={c.to} className={cn(cls, 'border-border bg-card hover:border-primary')}>{body}</Link>
  );
}

export default function SettingsHubPage() {
  const { hasPermission, currentUser } = useAuth();

  // **権限が無いものはカードごと出さない。** 押せば 403 になるだけで、
  // 並んでいると「自分が直せるはず」と読まれる
  const mobile = useIsMobile();
  const groups = HUB_GROUPS
    .map((g) => ({
      ...g,
      cards: g.cards.filter((c) => {
        if (mobile && c.to && CLIENT_MOBILE_HIDDEN.includes(c.to)) return false;
        return !c.module || hasPermission(c.module);
      }),
    }))
    .filter((g) => g.cards.length > 0);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="設定"
        sub="直した内容は、次に作る予約・見積・タスクから反映されます。過去の記録はさかのぼって書き換わりません"
      />

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          設定を編集できる人は<strong className="font-bold">役割ごとに決まっています</strong>。
          カードに書いてあるのがその役割です。ほかの人は閲覧のみになります
          {currentUser?.role === 'system_admin' && <>（あなたは<strong className="font-bold">管理者</strong>なので全部直せます）</>}。
        </span>
      </p>

      {/* **1枚も無いときに見出しだけ残さない。** 何をすればよいか書く */}
      {groups.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-subtle p-4 text-sub text-secondary-foreground">
          あなたの権限で開ける設定はありません。必要なものがあれば管理者に依頼してください。
        </p>
      ) : mobile ? (
        // **iOS 設定アプリのようなセクション区切りリスト**（監査 2026-08-20 の指摘）。
        // PC のカードグリッドを縮めたものではなく、行として組み直している
        <SettingsHubList groups={groups} />
      ) : groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2.5">
          <h2 className="text-note font-bold tracking-wider text-muted-foreground">{g.label}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.cards.map((c) => <Card key={c.key} c={c} />)}
          </div>
        </section>
      ))}

      <p className="text-note text-muted-foreground">
        アプリのバージョンとバックアップの取り出しは
        <Link to="/settings/system" className="inline-block py-[13px] -my-[13px] ml-1 text-primary underline">システムの情報</Link>
        に移しました（毎日使うものではないため）。
      </p>
    </div>
  );
}
