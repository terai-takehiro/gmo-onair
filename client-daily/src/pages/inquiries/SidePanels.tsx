/**
 * ⑤ 入ってきた情報 — 右側の枠（出どころ別・よく使うタグ・この画面ですること）
 *
 * ── 247: **空の枠を描かない** ────────────────────────────────
 *
 * ここは長らく「メール N件 ／ Slack 0 ／ 電話 0 ／ 口頭 0」と
 * 「まだタグが付いていません」を出し続けていました。**画面の右半分が、
 * 中身の無い枠**だった、ということです。
 *
 * 原因は画面ではなく取込側にあります — 本番のメール取込スキルは
 * リポジトリの外にあり、`source` と `tags` をまだ渡していません
 * （docs/mcp-server.md の「スキルに入れる変更」①〜③）。
 * **直るまでは枠を出さず、なぜ空なのかを1文で書きます。**
 * 枠だけ出しておくと「この会社には Slack から情報が来ない」と読めてしまい、
 * 事実（取込がまだ渡していない）と違うことを画面が言うことになります。
 *
 * ── 数えるのはサーバー ──────────────────────────────────────
 *
 * 出どころ別もタグも `GET /dailyops/inquiries/counts` /
 * `GET /dailyops/inquiries/tags` の数を使います。一覧は上限つきで引くので、
 * 運んだ行から数えると**その画面ぶんの内訳**を全体の内訳として出してしまいます。
 */
import { Mail, MessageSquare, Phone, Users, Pencil, Info, Tag } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { INQUIRY_SOURCE_LABELS } from '@/lib/types';
import { hasSourceBreakdown } from './state';

const ICON = { mail: Mail, 'message-square': MessageSquare, phone: Phone, users: Users, pencil: Pencil };
const SRC_ICON: Record<string, keyof typeof ICON> = {
  mail: 'mail', slack: 'message-square', phone: 'phone', talk: 'users', manual: 'pencil',
};
const SRC_TONE: Record<string, string> = {
  mail: 'bg-primary-surface text-primary',
  slack: 'bg-ai-surface text-ai',
  phone: 'bg-warning-surface text-warning',
  talk: 'bg-muted text-muted-foreground',
  manual: 'bg-muted text-muted-foreground',
};

export interface SourceCount { source: string; total: number; ticket: number }

export function SidePanels({
  sources, tags, activeTag, onPickTag,
}: {
  /** サーバーが数えた出どころ別（0 件のものは入っていない） */
  sources: SourceCount[];
  tags: { tag: string; count: number }[];
  activeTag: string | null;
  onPickTag: (tag: string | null) => void;
}) {
  const showSources = hasSourceBreakdown(sources);
  const showTags = tags.length > 0;

  return (
    <div className="flex w-full flex-col gap-3.5 lg:w-[320px] lg:shrink-0">
      {/* **この画面ですることを最初に置く。** 数の内訳より先に読ませる */}
      <section className="rounded-card flex items-start gap-2.5 border border-info-border bg-info-surface p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">未仕分けを空にするのがこの画面の仕事です。</strong>
          やることになるならチケット（案件管理のタスクになります）、案件になりそうなら案件の受付へ、
          <strong className="font-bold">あとで効く話ならストックして見直す日を決める</strong>。
          どれでもないものは見送りにします。ストックは見直す日が来ると、
          未仕分けと同じようにここへ戻ってきます。
        </p>
      </section>

      {showSources && (
        <section className="rounded-card border border-border bg-card p-4">
          <h2 className="text-cardtitle">出どころ別</h2>
          <p className="text-note mt-0.5 text-muted-foreground">すべての件数 ／ うちチケットにしたもの</p>
          <ul className="mt-2">
            {sources.map((s) => {
              const Icon = ICON[SRC_ICON[s.source] ?? 'pencil'];
              return (
                <li key={s.source} className="flex items-center gap-2.5 border-t border-border-faint py-1.5">
                  <span className={cn('rounded-note inline-flex h-6 w-6 shrink-0 items-center justify-center', SRC_TONE[s.source] ?? SRC_TONE.manual)}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span className="text-sub min-w-0 flex-1 truncate">{INQUIRY_SOURCE_LABELS[s.source] ?? s.source}</span>
                  <span className="font-number text-sub w-10 shrink-0 text-right font-bold">{s.total} 件</span>
                  <span className="font-number text-note w-16 shrink-0 text-right text-muted-foreground">
                    チケット {s.ticket}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showTags && (
        <section className="rounded-card border border-border bg-card p-4">
          <h2 className="text-cardtitle">よく使うタグ</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                aria-pressed={activeTag === t.tag}
                onClick={() => onPickTag(activeTag === t.tag ? null : t.tag)}
                className={cn(
                  'rounded-control text-note min-h-tap inline-flex items-center gap-1.5 border px-2.5 font-bold lg:min-h-[26px]',
                  activeTag === t.tag
                    ? 'border-primary bg-primary-surface text-primary'
                    : 'border-border bg-card text-secondary-foreground',
                )}
              >
                <Tag className="h-3 w-3" aria-hidden="true" />
                {t.tag}
                <span className="font-number text-muted-foreground">{t.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/*
        **枠の代わりに1文だけ出す。** 空の枠を並べるより短く、
        「なぜ空なのか（画面の不具合ではない）」が読めます
      */}
      {!showSources && !showTags && (
        <p className="text-note text-muted-foreground">
          出どころ別の内訳とタグは、メールの取り込みが出どころ（メール／Slack／電話／口頭）と
          タグを渡すようになると出ます。いまは<strong className="font-bold">まだ分かれていません</strong>。
          手で足した情報にタグを付けると、その分だけここに出ます。
        </p>
      )}
    </div>
  );
}
