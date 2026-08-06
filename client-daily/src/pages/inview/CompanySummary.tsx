/**
 * 内覧会 来場予約 — 会社別のまとめ (v4)
 *
 * 受付では「◯◯社は何人来る予定か」を訊かれる。名簿を目で数えると
 * 同行者を落とすので、会社ごとに**人数 (代表 + 同行者)** を出す。
 *
 * v4 で `RowSlot` に載せ替えた。以前は会社名と人数を `justify-between` で
 * 突き放していたので、会社名の長さで数字の位置が行ごとに動いていた。
 */
import { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import type { InviewRegistration } from '@/lib/types';
import { headOf } from './logic';

export function CompanySummary({ items }: { items: InviewRegistration[] }) {
  const summary = useMemo(() => {
    const map = new Map<string, { company: string; regs: number; head: number }>();
    for (const r of items) {
      const key = (r.company || '（会社名なし）').trim() || '（会社名なし）';
      if (!map.has(key)) map.set(key, { company: key, regs: 0, head: 0 });
      const e = map.get(key)!;
      e.regs += 1;
      e.head += headOf(r);
    }
    return [...map.values()].sort((a, b) => b.head - a.head || a.company.localeCompare(b.company, 'ja'));
  }, [items]);

  const totalHead = summary.reduce((a, s) => a + s.head, 0);

  return (
    <div className="rounded-card border border-border bg-surface-subtle p-3">
      <p className="text-th mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        会社別のまとめ（{summary.length}社 / {totalHead}名）
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {summary.map((s) => (
          <Row key={s.company} density="table" divider className="px-0">
            <RowMain><RowTitle>{s.company}</RowTitle></RowMain>
            <RowSlot w={72} align="right">
              <span className="font-number text-sub">{s.head}名</span>
            </RowSlot>
            <RowSlot w={56} align="right" placeholder="">
              {s.regs > 1 ? <span className="font-number text-sub-sm text-muted-foreground">{s.regs}組</span> : null}
            </RowSlot>
          </Row>
        ))}
      </div>
    </div>
  );
}
