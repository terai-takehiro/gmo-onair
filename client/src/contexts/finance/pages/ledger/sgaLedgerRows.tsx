/**
 * ⑤ 販管費の台帳の「値の作り方」— 行・絞り込みの軸・詳細シートの項目 (v4)
 *
 * ── なぜ画面から切り出したか ────────────────────────────────
 *
 * スマホ対応（カード＋詳細シート）で `SgaListPage.tsx` が 400 行を超えたため
 * （`scripts/check-file-size.mjs`）。**画面に残すのは「どう並べるか」だけ**にし、
 * 「何を出すか」（行の詰め替え・絞り込みの軸・詳細シートの項目）はここに集める。
 * この3つは**同じ値を別の場所に出しているだけ**なので、離すと必ず片方だけ直る。
 *
 * `sgaDetailFields` は `ledgerDetail.tsx`（3台帳ぶんを1ファイルに置く）
 * に住むもの。売上・仕入と**同時に作業していて衝突するため**こちらに置いた。
 * 3つそろったら `ledgerDetail/{revenue,purchase,sga}.tsx` に並べ直すこと。
 */
import { sgaDetailFields } from './ledgerDetail';
import { settlementState } from './settlementState';
import type { LedgerFilterGroup } from './LedgerFilterBar';
import type { LedgerRow, SgaLedgerItem } from './types';


/**
 * 絞り込みの軸①「種類」。**勘定科目とは別の軸**で、どちらも経理が使うので両方残す。
 * `expense_type`（固定費／都度）と `source`（社員／経理）を1本の帯にまとめてある。
 */
export const SGA_CHIPS = [
  { key: 'all', label: 'すべて', expense_type: '', source: '', count: 'all' },
  { key: 'fixed', label: '固定費', expense_type: 'fixed', source: '', count: 'fixed' },
  { key: 'spot', label: '都度', expense_type: 'spot', source: '', count: 'spot' },
  { key: 'staff', label: '社員が入れた', expense_type: '', source: 'staff', count: 'staff' },
  { key: 'accounting', label: '経理の取込', expense_type: '', source: 'accounting', count: 'accounting' },
];

/** いま選ばれている軸①。知らない値で来ても「すべて」に倒す */
export function sgaChipOf(key: string) {
  return SGA_CHIPS.find((c) => c.key === key) ?? SGA_CHIPS[0];
}


/**
 * 一覧の行（PC の表・スマホのカードが同じものを読む）。
 *
 * ⚠️ **必ず `useMemo` の中から呼ぶこと**（`types.ts` の `detail` の説明）。
 * 詳細シートの項目を20行ぶん、毎レンダリング作り直すことになる。
 */
export function sgaLedgerRows(items: SgaLedgerItem[]): LedgerRow[] {
  return items.map((item) => ({
    id: item.id,
    // 勘定科目の列が無いので精算番号を出す（`pending` は「番号待ち」）
    code: item.settlement_number === 'pending' ? '番号待ち' : item.settlement_number,
    title: item.description || '（詳細なし）',
    sub: null,
    party: item.vendor_name,
    amount: Number(item.amount) || 0,
    tax_category: item.tax_category,
    recognition_date: item.recognition_date,
    /*
     * 申請ステータス（仮 / 確定：未申請 / 確定：申請済）。**仕入と共通のロジック**
     * （`settlementState.ts`）。以前はここで「分け方・固定／都度」を出していたが、
     * 行1つに出せるバッジは1つなので申請ステータスへ統一した（仕様変更 #4・#6・#7）。
     * 種別は絞り込みの帯（`SGA_CHIPS`）と詳細シートで確認できる
     */
    state: settlementState(item.is_provisional, item.settlement_number),
    // **販管費は案件に紐づかない**（この画面が案件で絞れないのと同じ理由）。
    // `null` なので詳細シートに「案件をひらく」は出ない＝行き止まりを作らない
    project_id: null,
    settlement_url: item.settlement_url,
    // スマホの詳細シートに出す項目（PC の表は読まない）
    detail: sgaDetailFields(item),
  }));
}

/**
 * 絞り込みの2軸（種類・勘定科目）。**PC の帯とスマホのシートで同じものを使う**
 * （`LedgerFilterBar` が幅で形を変える）。
 *
 * `defaultValue` は「効いている数」を数えるための既定値で、**ここが実際の初期値と
 * ずれると、絞り込んでいないのにバッジが出る／絞り込んでいるのに出ない**。
 */
export function sgaFilterGroups(o: {
  chip: string;
  onChip: (k: string) => void;
  titleKey: string;
  onTitle: (k: string) => void;
  /** 種類ごとの件数（サーバーが絞り込み全体で数えたもの） */
  counts: Record<string, number>;
  /** 勘定科目ごとの件数 */
  titleCounts: Record<string, number>;
  titles: { id: string; name: string }[];
}): LedgerFilterGroup[] {
  return [
    {
      key: 'kind',
      label: '販管費の種類で絞り込む',
      sheetLabel: '種類',
      items: SGA_CHIPS.map((c) => ({ key: c.key, label: c.label, count: o.counts[c.count] ?? null })),
      value: o.chip,
      defaultValue: 'all',
      onChange: o.onChip,
    },
    {
      // 勘定科目（migration 166）。**「未設定」は 166 より前の行**で、
      // どの科目だったか記録が無い。数えられるので隠さない
      key: 'title',
      label: '勘定科目で絞り込む',
      sheetLabel: '勘定科目',
      items: [
        { key: '', label: '科目すべて', count: o.counts.all ?? null },
        ...o.titles.map((t) => ({ key: t.id, label: t.name, count: o.titleCounts[t.id] ?? 0 })),
        { key: 'none', label: '未設定', count: o.titleCounts.none ?? 0 },
      ],
      value: o.titleKey,
      defaultValue: '',
      onChange: o.onTitle,
    },
  ];
}
