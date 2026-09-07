/**
 * 台帳の一覧（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通）— **幅の分岐はここだけ** (v4)
 *
 * PC は表（`LedgerRows`）、スマホはカード（`LedgerCards`）。
 * 3つの画面が触るのは `<LedgerRows …>` を `<LedgerList …>` に替える1行だけで、
 * **写しを3つ作りません**（列の意味は3画面で同じなので、分けると必ずずれます）。
 *
 * ⚠️ **早期 return にしないこと**（`client/CLAUDE.md`「スマホ」）。
 * 部品の中で `if (mobile) return …` と書くと、幅が変わったときに
 * フックの数が変わって React が落ちます。ここは `useIsMobile()` を1本呼んで
 * **描くものを入れ替えるだけ**にしてあります。
 */
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { LedgerRows, type LedgerSortKeys } from './LedgerRows';
import { LedgerCards } from './LedgerCards';
import type { LedgerRow } from './types';

export interface LedgerListProps {
  rows: LedgerRow[];
  /** PC の列名。スマホは列を持たないので使わない */
  codeLabel: string;
  /** 見出しの列名（PC の表の見出し。例「案件」） */
  titleLabel: string;
  /**
   * 台帳の呼び名（売上／仕入／販管費）。スマホの詳細シートの
   * 「この◯◯を直す」に使う。**列名（`titleLabel`）とは別物**
   * — 売上台帳の見出し列は「案件」で、直す対象は「売上」
   */
  itemLabel: string;
  partyLabel: string;
  /** 状態の列名。`null` ならこの台帳に状態は無い */
  stateLabel: string | null;
  /**
   * 行を「直す」。PC は行を押したときに呼ばれ、スマホは詳細シートの
   * 「この◯◯を直す」から呼ばれる（**PC の `onOpen` と同じもの**）
   */
  onOpen: (row: LedgerRow) => void;
  /** 「案件をひらく」。渡さなければ出さない（販管費は案件を持たない） */
  onProject?: (row: LedgerRow) => void;
  canEdit: boolean;
  /**
   * 上に引いて再取得（スマホだけ）。`query.refetch` をそのまま渡す。
   * 台帳は「他の人が入れた直後の数字を外で確かめる」場面で開くので、
   * 更新の手段が `ErrorPanel` の再読み込みしか無いのは足りない
   */
  onRefresh: () => Promise<unknown> | unknown;
  /**
   * 表頭クリックの並べ替え（2026-09 依頼「列見出しで昇順・降順」）。**PC の表
   * （`LedgerRows`）にだけ渡す**——スマホはカードで、そもそも列見出しという
   * 概念が無い（`ProjectRowsHeader` を「スマホでは出しません」としているのと
   * 同じ扱い）。渡さなければ `LedgerRows` は今までどおり押せない見出しのまま
   */
  sort?: string;
  onSort?: (key: string) => void;
  sortKeys?: LedgerSortKeys;
}

export function LedgerList(p: LedgerListProps) {
  const isMobile = useIsMobile();

  return isMobile ? (
    // ここは必ずスマホなので `disabled` は常に false。
    // それでも明示するのは、部品側が「呼び出し側が明示する」形にしているため
    <PullToRefresh onRefresh={p.onRefresh} disabled={false}>
      <LedgerCards
        rows={p.rows}
        itemLabel={p.itemLabel}
        stateLabel={p.stateLabel}
        onOpen={p.onOpen}
        onProject={p.onProject}
        canEdit={p.canEdit}
      />
    </PullToRefresh>
  ) : (
    <LedgerRows
      rows={p.rows}
      codeLabel={p.codeLabel}
      titleLabel={p.titleLabel}
      partyLabel={p.partyLabel}
      stateLabel={p.stateLabel}
      onOpen={p.onOpen}
      sort={p.sort}
      onSort={p.onSort}
      sortKeys={p.sortKeys}
    />
  );
}
