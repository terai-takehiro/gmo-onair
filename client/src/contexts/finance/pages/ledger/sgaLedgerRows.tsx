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
 * ⚠️ `sgaDetailFields` は本来 `ledgerDetail.tsx`（3台帳ぶんを1ファイルに置く）
 * に住むもの。売上・仕入と**同時に作業していて衝突するため**こちらに置いた。
 * 3つそろったら `ledgerDetail/{revenue,purchase,sga}.tsx` に並べ直すこと。
 */
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { SettlementMethodLabels, type SettlementMethod, type SgaExpense } from '@/types';
import { formatSettlementNo } from '../../components/SgaDialog';
import { monthFull, ymd } from './format';
import { settlementState } from './settlementState';
import type { LedgerFilterGroup } from './LedgerFilterBar';
import type { LedgerDetailField, LedgerRow } from './types';

/**
 * 一覧が返す販管費の行。
 *
 * ⚠️ **`account_title_name` はサーバーが返しているのに型に無かった**
 * （`GET /sga` は `SELECT s.*, at.name AS account_title_name` で
 * `sga_account_titles` を LEFT JOIN している）。`client/src/types` は
 * 他の画面も読む共有の型なので、**この台帳が受け取る形だけ**をここで足す。
 * 科目名を画面に出せるのはこの列があるからで、`account_title_id` から
 * 引き直すと一覧を描くたびにマスターを走査することになる。
 */
export type SgaLedgerItem = SgaExpense & {
  account_title_id?: string | null;
  account_title_name?: string | null;
};

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

/** 文字が無いときは `—`（`0` や `false` を消さないよう、文字列だけに使う） */
function textOr(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

/**
 * 精算の申請番号。**方法（X-Point ／ 楽楽精算）の接頭辞を付けて出す** —
 * 経理はこの形のまま突き合わせるので、番号だけだとどちらの精算システムを
 * 見ればよいか分からない（`formatSettlementNo` は一覧・ダイアログと同じもの）。
 *
 * `pending` は「番号待ち」の符丁で、実の番号ではない（`settlementState.ts`）。
 */
function settlementText(item: SgaLedgerItem): string {
  if (item.settlement_number === 'pending') return '番号待ち（申請はこれから）';
  const no = formatSettlementNo(item.settlement_method ?? '', item.settlement_number ?? '');
  if (no) return no;
  const method = item.settlement_method
    ? SettlementMethodLabels[item.settlement_method as SettlementMethod] ?? item.settlement_method
    : null;
  // 番号が無い＝まだ申請していない。**空欄にしない**（出ていないのか無いのかが読めなくなる）
  return method ? `まだ申請していません（${method}）` : 'まだ申請していません';
}

/**
 * スマホの詳細シートに出す項目。**カードが出さない値の行き先**。
 *
 * カードは4つ（精算番号・発生月／金額／詳細／支払先・申請ステータス）しか
 * 出さないが、**捨てるのは列であって情報ではない**ので、落とした値をここへ移す。
 * 販管費は案件に紐づかないぶん、経理が突き合わせに使う値（勘定科目・精算番号・
 * 支払期日）を上のほうに置いている。
 *
 * ⚠️ 税区分は入れない — 詳細シートの金額の塊が「税抜 ・ 10%課税」で既に出している
 * （同じ値を1枚の中に2回出すと、片方だけ直されて食い違う）。
 */
export function sgaDetailFields(item: SgaLedgerItem): LedgerDetailField[] {
  return [
    { label: '発生月', value: monthFull(item.recognition_date) },
    { label: '支払先', value: textOr(item.vendor_name) },
    // 166 より前の行は科目を持たない。**「未設定」と書く**（空にすると
    // 「読み込めていない」と区別が付かない・`SgaListPage.tsx` の冒頭）
    { label: '勘定科目', value: item.account_title_name || '未設定' },
    { label: '費用の種類', value: item.expense_type === 'fixed' ? '固定費' : '都度' },
    { label: '入れた人', value: item.source === 'accounting' ? '経理の取込' : '社員が入れた' },
    { label: '精算', value: settlementText(item) },
    { label: '支払期日', value: ymd(item.payment_due_date) },
    { label: 'インボイス', value: item.invoice_qualified ? '登録あり' : '登録なし' },
    {
      // 「按分」は画面に出さないと決めた言葉（`scripts/check-ui-tokens.mjs`）。
      // 月をまたいで分けている費用だけが値を持ち、それ以外は `—` になる
      label: '分け合う期間',
      value: (
        // 期間は文字列で組み立てない（開始・区切り・終了を分ける部品を使う）。
        // 分け方の欄は `<input type="month">` なので `2026-04` の形で来る
        <DateRange
          start={item.amortize_start ? monthFull(item.amortize_start) : null}
          end={item.amortize_end ? monthFull(item.amortize_end) : null}
        />
      ),
    },
    { label: '備考', value: textOr(item.notes) },
  ];
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
