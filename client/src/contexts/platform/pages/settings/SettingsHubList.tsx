/**
 * 設定トップ — スマホのリスト（iOS 設定アプリのようなセクション区切り）
 *
 * ── PC のカードグリッドをそのまま畳んだものではない ──────────────
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md`）の指摘: 「カードグリッドを
 * `sm:grid-cols-2` に畳んでいるだけで、iOS 設定アプリのようなセクション区切り
 * リスト行（chevron 付き）になっていない」。375px でカードを1列に畳むと、
 * カード同士の余白（`gap-3` の12px × 9枚）だけで縦が伸び、押せる行の境目も
 * 曖昧になる。iOS 設定アプリは**枠1つの中に行を詰め、行の間だけ薄い罫線**を
 * 引く。ここではそれに合わせ、グループごとに `Row` を並べた1枚の枠にする。
 *
 * ── 「直せるのは誰か」は行の中に残す ──────────────────────────
 *
 * PC のカード（`SettingsHubPage.tsx` の `Card`）と同じ理由 —
 * 押してから 403 で気づくのを避けるため、行の3行目にそのまま出す。
 * 削るとスマホだけ情報が減ることになる。
 */
import { ChevronRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { HubGroup } from './hubCards';

export function SettingsHubList({ groups }: { groups: HubGroup[] }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <h2 className="text-note px-1 font-bold tracking-wider text-muted-foreground">{g.label}</h2>
          <div className="overflow-hidden rounded-card border border-border bg-card">
            {g.cards.map((c) => {
              const Icon = c.icon;
              const disabled = !c.to;
              return (
                <Row
                  key={c.key}
                  divider
                  align="start"
                  interactive={!disabled}
                  role={disabled ? undefined : 'button'}
                  tabIndex={disabled ? undefined : 0}
                  aria-disabled={disabled || undefined}
                  onClick={disabled ? undefined : () => navigate(c.to as string)}
                  onKeyDown={disabled ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(c.to as string); }
                  }}
                  className={cn(
                    !disabled && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    disabled && 'opacity-70',
                  )}
                >
                  <RowSlot w={56} align="center">
                    <span className={cn('rounded-control-lg inline-flex h-9 w-9 items-center justify-center', c.tone)}>
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                  </RowSlot>

                  <RowMain>
                    <span className="text-list block">{c.title}</span>
                    {disabled ? (
                      <span className="text-note mt-0.5 block text-warning">
                        <strong className="font-bold">これから作ります。</strong>
                        {c.todo?.replace(/\*\*/g, '')}
                      </span>
                    ) : (
                      <>
                        <span className="text-note mt-0.5 block truncate text-muted-foreground">{c.desc}</span>
                        <span className="text-note mt-0.5 block text-muted-foreground">直せるのは {c.who}</span>
                      </>
                    )}
                  </RowMain>

                  {disabled ? (
                    <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="これから作ります" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
                  )}
                </Row>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
