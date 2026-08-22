/**
 * トップページのアプリタイル (v4)
 *
 * ── 2段に分ける ──────────────────────────────────────────────
 *
 * **アプリ**（日々の業務・3列の大きいタイル）と
 * **イベントで使うもの**（本番でだけ開く・4列の小さいタイル）。
 * モックが分けているとおりです。毎日使うものと、案件の本番の日にだけ使うものを
 * 同じ並びに置くと、毎日の入口が探しにくくなります。
 *
 * ── PC とスマホでタイルの形が違う（モックのとおり）────────────
 *
 * | | PC | スマホ |
 * | --- | --- | --- |
 * | アプリ | 3列・横長（アイコン56 ＋ 名前20px/800） | **2列の正方形**（92px・アイコン40 ＋ 名前15px・件数は右上） |
 * | イベント | 4列の小さいタイル | **ピル（丸い横並び）** |
 *
 * スマホを PC と同じ縦積みにすると、**アプリだけで画面が3枚ぶん**になり
 * 「今日」に着くまでこすることになります（M3 でいちど並べ替えて逃げましたが、
 * モックは**タイルの形そのもの**を変えて短くしています）。
 *
 * ── 説明文はタイルに書かない（モック）──────────────────────
 *
 * モックのタイルは**アイコン ＋ 名前の1行だけ**です。説明を足すと
 * 「読ませる物」になり、毎日押す入口としては重くなります
 * （説明はアプリ切替の一覧と ⑪ 探すにあります）。
 *
 * ── 数字は「押せば片づくもの」の件数 ────────────────────────
 *
 * そのアプリにある物の総数ではありません。総数は押す理由になりません。
 * **数えられないアプリには数字を出しません**（設定・プロジェクト管理）。
 *
 * ── 別バンドルのアプリは `window.location` で開く ────────────
 *
 * 日常業務・機材管理・凍結4アプリは別の Vite バンドルなので、
 * `navigate()` では飛べません（画面が真っ白になる）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, ChevronDown,
  CalendarCheck, DoorOpen, FileText, Inbox, KeyRound, Newspaper,
  type LucideIcon,
} from 'lucide-react';
import { APPS, type AppDef } from '@gmo-onair/shared/src/client/apps';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { CountUp } from './Reveal';

/** 別バンドル = フルリロードが要るアプリ */
const SEPARATE_BUNDLE = ['dailyops', 'equipment', 'techops', 'liveops'];

/**
 * 「イベントで使うもの」に回すアプリ。**本番の日にだけ開くもの**
 *
 * **`HomePage.tsx` の `DAILY_KEYS` と対になっている**ので、片方だけ直すと
 * タイルが二重に出るか、どこにも出なくなります。
 *
 * ⚠️ **リアルタイムCG (`awards`) は廃止したのでここから外した。**
 * コードは `client-awards/` に残すが、サーバーの配信・ルーティングを止めたので
 * URL 直打ちでも開けない（`client-awards/CLAUDE.md` 参照）。
 *
 * ⚠️ **制作技術支援 (`qsheet`・旧「制作資料」) は 2026-08-22 のご指示で
 * ここから `DAILY_KEYS`（日々の業務）へ格上げした。** 凍結も解け v4 共通シェルにも
 * 載せ替え済みのため、もう「本番の日にだけ開くもの」ではない。
 */
const EVENT_KEYS = ['liveops'];

/**
 * タイルの中に畳んである「ミニアプリ」（モックの `MINI`）。
 *
 * モックがミニアプリを持たせているのは**日常業務だけ**です。日常業務は
 * 中身が6つに分かれていて（週報・ニュース・書類・問い合わせ・内覧会・カード）、
 * タイルを押しても**そのアプリのホームに着くだけ**で、目的の画面へはもう1手要ります。
 *
 * ⚠️ **件数は出しません。** モックは「届いた見積・請求書 2」のように数を書きますが、
 * その数は受信箱（`/dashboard/inbox`）が数えているものと**同じ物を別の粒度**で
 * 数え直すことになり、タイルの数字と食い違う恐れがあります
 * （同じものを2か所で数えない）。
 *
 * 行き先は `client-daily/src/components/layout/nav.ts` と同じです。
 * **別バンドル**なので `window.location` で開きます。
 */
const MINI_APPS: Record<string, Array<{ label: string; to: string; icon: LucideIcon }>> = {
  dailyops: [
    { label: 'ウィークリー活動報告', to: '/daily/weekly', icon: CalendarCheck },
    { label: 'デイリーニュース報告', to: '/daily/news', icon: Newspaper },
    { label: '入ってきた情報', to: '/daily/inquiries', icon: Inbox },
    { label: '受け取った書類', to: '/daily/finance', icon: FileText },
    { label: '内覧会 来場予約', to: '/daily/inview', icon: DoorOpen },
    { label: 'セキュリティカード', to: '/daily/security-cards', icon: KeyRound },
  ],
};

export interface TileApp extends AppDef {
  /** 押せば片づくものの件数。`undefined` なら数字を出さない */
  badge?: number;
  /** 数字を赤くする（放っておくと相手を待たせるもの） */
  urgent?: boolean;
}

function useOpen() {
  const navigate = useNavigate();
  return (app: AppDef) => {
    if (app.external) {
      window.open(app.external, '_blank', 'noopener,noreferrer');
    } else if (SEPARATE_BUNDLE.includes(app.key)) {
      window.location.href = app.path;
    } else {
      navigate(app.path);
    }
  };
}

/** 件数の丸。PC は行の右端、スマホはタイルの右上。**数字は数え上げて出す** */
function Badge({ n, urgent, className }: { n: number; urgent?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-chip font-number text-sub inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center px-2 font-bold text-white',
        urgent ? 'bg-destructive' : 'bg-primary',
        className,
      )}
    >
      <CountUp n={n} />
    </span>
  );
}

/** 日々の業務アプリ。PC は3列の大きいタイル、スマホは2列の正方形 */
export function AppTiles({ apps, mobile }: { apps: TileApp[]; mobile?: boolean }) {
  const open = useOpen();
  // **見出しだけ残さない。** 権限が1つも無い人には空の枠ではなく、次の一手を書く
  if (apps.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-3 text-sub text-secondary-foreground">
        使えるアプリがまだありません。必要なアプリを管理者にご依頼ください。
      </p>
    );
  }

  if (mobile) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {apps.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => open(a)}
            className="rounded-card relative flex min-h-[92px] flex-col items-start justify-between border border-border bg-card p-3.5 text-left"
          >
            <span
              className="rounded-control-lg flex h-10 w-10 shrink-0 items-center justify-center"
              style={{ backgroundColor: `${a.color}1a` }}
            >
              <a.icon className="h-5 w-5" style={{ color: a.color }} aria-hidden="true" />
            </span>
            {/* **名前は折り返す。** 375px の2列で truncate すると
                「プロジェクト管理」が「プロジェク…」になり、何のアプリか読めない */}
            <span className="text-cardtitle mt-2.5 block">{a.label}</span>
            {a.badge !== undefined && a.badge > 0 && (
              <Badge n={a.badge} urgent={a.urgent} className="absolute right-3 top-3" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((a) => (
        <DesktopTile key={a.key} app={a} onOpen={() => open(a)} />
      ))}
    </div>
  );
}

/**
 * PC のタイル1枚。**ミニアプリを持つものは下に開く**（モック）。
 *
 * モックはマウスを載せると開きますが、それだけにすると
 * **キーボードと指では開けません**。`chevron` を**押せるボタン**にして、
 * hover でも click でも開くようにしてあります
 * （`<button>` の中に `<button>` は置けないので、タイルの枠を `div` にして
 *  中に「開く」ボタンと「畳みを開く」ボタンを並べています）。
 */
function DesktopTile({ app, onOpen }: { app: TileApp; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const mini = MINI_APPS[app.key];

  return (
    <div
      className="relative"
      onMouseEnter={() => mini && setOpen(true)}
      onMouseLeave={() => mini && setOpen(false)}
    >
      {/*
       * **モックはアプリのタイルを持ち上げます**（`translateY(-2〜-4px)` ＋ 影 ＋
       * アイコンが少し跳ねる）。`_tokens.md` の「hover は色・罫線のみ」は
       * 行や小さいボタンの話で、**モック自身はタイルを持ち上げている**ので
       * そちらに合わせました。動きは `tokens-v4.css` の `.v4-lift`
       * （マウスがある端末だけ・動きを減らす設定では止まる）。
       */}
      {/* `v4-gloss` は光を1本走らせる（モック `v4-live`）。**マウスがある端末だけ**で、
          動きを減らす設定では止まる（どちらも `tokens-v4.css` 側で見ている） */}
      <div
        className={cn(
          'rounded-app v4-lift v4-gloss flex items-center gap-4 border border-border bg-card p-5',
          'hover:border-primary-border-strong hover:shadow-lg',
          open && 'border-primary-border-strong shadow-lg',
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="min-h-tap flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <span
            className="rounded-app v4-lift-icon flex h-14 w-14 shrink-0 items-center justify-center"
            style={{ backgroundColor: `${app.color}1a` }}
          >
            <app.icon className="h-7 w-7" style={{ color: app.color }} aria-hidden="true" />
          </span>
          <span className="text-h2 min-w-0 flex-1 truncate">{app.label}</span>
          {/*
            ⚠️ **件数はタイルを開くボタンの中に置く**（レビューでの指摘 #68）。
            前の版はボタンの**外**（枠の直下）にあったので、**数字を押しても
            何も起きませんでした**。件数は「押せば片づくものが N 件ある」という
            意味なので、いちばん押されるのがこの数字です。
            スマホ側はタイルまるごとが1つのボタンなので、もともと押せています。
          */}
          {app.badge !== undefined && app.badge > 0 && <Badge n={app.badge} urgent={app.urgent} />}
        </button>
        {mini && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${app.label} の中のミニアプリ`}
            className="min-h-tap min-w-tap -mr-2 flex items-center justify-center text-muted-foreground lg:min-h-0 lg:min-w-0"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
      </div>

      {mini && open && (
        <div className="absolute inset-x-0 top-full z-20 pt-2">
          <div className="rounded-card border border-primary-border bg-card p-3 shadow-2xl shadow-black/10">
            <p className="v4-eyebrow px-1.5 pb-1.5">この中のミニアプリ</p>
            {mini.map((m) => (
              <a
                key={m.to}
                href={m.to}
                className="text-list min-h-tap flex items-center gap-2.5 rounded-control-lg px-2 py-2 hover:bg-primary-surface-weak lg:min-h-0"
              >
                <span className="rounded-control-md flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface-weak">
                  <m.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 本番の日にだけ開くもの。PC は4列の小さいタイル、スマホはピル
 *
 * **ここも権限で絞る。** 凍結アプリにも権限モジュールがあり、
 * 絞らないと権限の無い人にも出て、押すと 403 になる。
 * 外部リンクは別サイト ↗なので権限を見ない（もともと誰でも開ける）。
 */
export function EventTiles({ mobile }: { mobile?: boolean }) {
  const open = useOpen();
  const { hasPermission } = useAuth();
  const items = APPS
    .filter((a) => EVENT_KEYS.includes(a.key) || a.external)
    .filter((a) => a.external || !a.permissionModule || hasPermission(a.permissionModule));
  if (items.length === 0) return null;

  if (mobile) {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => open(a)}
            className="text-list rounded-chip min-h-tap inline-flex items-center gap-2 border border-border bg-card px-4"
          >
            <a.icon className="h-4 w-4 shrink-0" style={{ color: a.color }} aria-hidden="true" />
            {a.label}
            {a.external && <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => open(a)}
          className="rounded-note v4-lift flex min-h-tap items-center gap-3 border border-border bg-card px-4 py-3 text-left hover:border-primary-border-strong hover:shadow-md"
        >
          <span
            className="rounded-control-lg v4-lift-icon flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ backgroundColor: `${a.color}1a` }}
          >
            <a.icon className="h-5 w-5" style={{ color: a.color }} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-cardtitle block truncate">{a.label}</span>
            {a.external && (
              <span className="text-note flex items-center gap-0.5 text-muted-foreground">
                別サイト ↗<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
