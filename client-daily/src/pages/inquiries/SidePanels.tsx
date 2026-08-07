/**
 * ⑤ 入ってきた情報 — 右側の3枚（出どころ別・よく使うタグ・行き先の説明）
 *
 * モックの右カラムそのまま。**タグの件数はサーバーが数えたものを使います**
 * （画面で数えると、タブを切り替えるたびに同じタグの件数が変わる）。
 */
import { Mail, MessageSquare, Phone, Users, Pencil, Info, Tag } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { INQUIRY_SOURCE_LABELS, type MiscInquiry } from '@/lib/types';
import { bySource } from './state';

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

export function SidePanels({
  all, tags, activeTag, onPickTag,
}: {
  all: MiscInquiry[];
  tags: { tag: string; count: number }[];
  activeTag: string | null;
  onPickTag: (tag: string | null) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3.5 lg:w-[320px] lg:shrink-0">
      <section className="rounded-card border border-border bg-card p-4">
        <h2 className="text-cardtitle">出どころ別</h2>
        {/* モックの見出しは「今週」だが中身は全件。受信日が空の行があり、
            今週で切ると出どころ別の合計が一覧の件数と合わなくなるので全件で数える */}
        <p className="text-note mt-0.5 text-muted-foreground">すべての件数 ／ うちチケットにしたもの</p>
        <ul className="mt-2">
          {bySource(all).map((s) => {
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

      <section className="rounded-card border border-border bg-card p-4">
        <h2 className="text-cardtitle">よく使うタグ</h2>
        {tags.length === 0 ? (
          <p className="text-note mt-1.5 text-muted-foreground">
            まだタグが付いていません。ストックするときに付けておくと、あとから引けます。
          </p>
        ) : (
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
        )}
      </section>

      <section className="rounded-card flex items-start gap-2.5 border border-info-border bg-info-surface p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          行き先は4つです。<strong className="font-bold">やることになる</strong>ならチケット
          （案件管理のタスクになります）、<strong className="font-bold">案件になりそう</strong>なら案件の受付へ、
          <strong className="font-bold">あとで効く話</strong>ならストックしてタグを付ける。
          どれでもないものは見送りにします。
        </p>
      </section>
    </div>
  );
}
