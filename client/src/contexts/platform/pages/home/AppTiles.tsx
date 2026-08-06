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
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { APPS, type AppDef } from '@gmo-onair/shared/src/client/apps';
import { useAuth } from '@/contexts/platform/AuthContext';

/** 別バンドル = フルリロードが要るアプリ */
const SEPARATE_BUNDLE = ['dailyops', 'equipment', 'qsheet', 'techsheet', 'liveops', 'awards'];

/** 「イベントで使うもの」に回すアプリ。**本番の日にだけ開くもの** */
const EVENT_KEYS = ['liveops', 'awards'];

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

/** 日々の業務アプリ。3列の大きいタイル */
export function AppTiles({ apps }: { apps: TileApp[] }) {
  const open = useOpen();
  // **見出しだけ残さない。** 権限が1つも無い人には空の枠ではなく、次の一手を書く
  if (apps.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-3 text-sub text-secondary-foreground">
        使えるアプリがまだありません。必要なアプリを管理者にご依頼ください。
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => open(a)}
          className="rounded-app flex min-h-tap items-center gap-4 border border-border bg-card p-5 text-left hover:border-primary-border-strong"
        >
          <span
            className="rounded-app flex h-14 w-14 shrink-0 items-center justify-center"
            style={{ backgroundColor: `${a.color}1a` }}
          >
            <a.icon className="h-7 w-7" style={{ color: a.color }} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-h2 block truncate">{a.label}</span>
            <span className="text-sub block truncate text-muted-foreground">{a.description}</span>
          </span>
          {a.badge !== undefined && a.badge > 0 && (
            <span
              className={`rounded-chip font-number inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center px-2 text-sub font-bold text-white ${
                a.urgent ? 'bg-destructive' : 'bg-primary'
              }`}
            >
              {a.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * 本番の日にだけ開くもの。4列の小さいタイル
 *
 * **ここも権限で絞る。** 凍結アプリにも権限モジュールがあり、
 * 絞らないと権限の無い人にも出て、押すと 403 になる。
 * 外部リンクは別サイトなので権限を見ない（もともと誰でも開ける）。
 */
export function EventTiles() {
  const open = useOpen();
  const { hasPermission } = useAuth();
  const items = APPS
    .filter((a) => EVENT_KEYS.includes(a.key) || a.external)
    .filter((a) => a.external || !a.permissionModule || hasPermission(a.permissionModule));
  if (items.length === 0) return null;
  return (
    <div className="border-t border-dashed border-border pt-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-3">
        <h3 className="text-cardtitle">イベントで使うもの</h3>
        <span className="text-note text-muted-foreground">
          案件の本番でだけ開きます。日々の業務アプリとは別の並びです
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => open(a)}
            className="rounded-card flex min-h-tap items-center gap-3 border border-border bg-card px-4 py-3 text-left hover:border-primary-border-strong"
          >
            <span
              className="rounded-control-lg flex h-10 w-10 shrink-0 items-center justify-center"
              style={{ backgroundColor: `${a.color}1a` }}
            >
              <a.icon className="h-5 w-5" style={{ color: a.color }} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-list block truncate font-bold">{a.label}</span>
              {a.external && (
                <span className="text-note flex items-center gap-0.5 text-muted-foreground">
                  別サイト<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
