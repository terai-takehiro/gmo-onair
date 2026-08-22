// 書き出す前の点検（3段）。モック `Export.dc.html` の `checks` に対応する。
//
// ⚠️ **灰色だけ1行にまとめる**（監査 2026-08-22）。
// サーバーは「配信先が無い ENC」を**1台につき1件**返すので、配信先を2台にしか
// 作っていない普通の日でも灰色が8行並び、**その上下の赤（現地で必ず弾かれる）が
// 埋もれて見えなかった**。赤・橙は1件ずつ理由が違うのでまとめない。
import type { PreflightIssue } from '@/lib/deviceSettingsApi';
import { groupGray } from './exportPlan';

/** 「赤」「橙」「灰」は内部の呼び名。**画面には出さない**（利用者には意味が伝わらない） */
function Block({
  title, meaning, tone, children, count,
}: {
  title: string;
  meaning: string;
  tone: 'bad' | 'warn' | 'mute';
  count: number;
  children?: React.ReactNode;
}) {
  const skin =
    tone === 'bad'
      ? 'border-destructive-border bg-destructive-surface'
      : tone === 'warn'
        ? 'border-warning-border bg-warning-surface'
        : 'border bg-muted';
  const fg = tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning' : 'text-muted-foreground';
  const dot = tone === 'bad' ? 'bg-destructive' : tone === 'warn' ? 'bg-warning' : 'bg-muted-foreground';

  return (
    <div className={`overflow-hidden rounded-card border ${skin}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <span className={`h-2 w-2 shrink-0 rounded-chip ${dot}`} />
        <span className={`text-list ${fg}`}>{title}</span>
        <span className={`tabular-nums text-sub-sm font-bold ${fg}`}>{count} 件</span>
        <span className="ml-auto text-sub-sm text-muted-foreground">{meaning}</span>
      </div>
      {children}
    </div>
  );
}

/** 1件ずつ出す側（赤・橙）。長い行は折り返す — 375px で横に流さない */
function IssueList({ issues }: { issues: PreflightIssue[] }) {
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto border-t bg-card px-3 py-2">
      {issues.map((r, i) => (
        <li key={`${r.where}-${r.code}-${i}`} className="text-sub-sm text-foreground">
          <span className="font-bold">{r.where}</span>
          <span className="text-muted-foreground">: </span>
          {r.message}
        </li>
      ))}
    </ul>
  );
}

export default function PreflightSummary({
  red, amber, gray,
}: {
  red: PreflightIssue[];
  amber: PreflightIssue[];
  gray: PreflightIssue[];
}) {
  const grouped = groupGray(gray);

  return (
    <div className="space-y-2">
      <Block title="直したほうがよい" meaning="現地で必ず弾かれます" tone="bad" count={red.length}>
        {red.length > 0 && <IssueList issues={red} />}
      </Block>

      <Block title="そのままでよい" meaning="出せますが、意図の確認を" tone="warn" count={amber.length}>
        {amber.length > 0 && <IssueList issues={amber} />}
      </Block>

      {/* 灰色は件数ではなく**まとめた行数**を出す（10台が1行になるので「10 件」と書くと数が合わない） */}
      <Block title="出さない" meaning="Excel の対象から外れます" tone="mute" count={gray.length}>
        {grouped.length > 0 && (
          <ul className="space-y-1 border-t bg-card px-3 py-2">
            {grouped.map((g) => (
              <li key={g.code} className="text-sub-sm text-muted-foreground">{g.text}</li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
