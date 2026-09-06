/**
 * 機材台帳 — 列の幅と「横に流し始める幅」の算数を固定する
 *
 * ── なぜ固定するか ──────────────────────────────────────────
 *
 * この画面の崩れは**どれも画面を見ても原因が分かりません**。
 *
 *  ① **列より広い中身は、押し出されずに隣の列の上に重なります**
 *    （`RowSlot` は `shrink-0`）。実際に「種別」が 72px で、
 *    `sectionDisplay()` の 8 通りのうち 5 通りが収まらず、
 *    **「設備/その他設備」が隣の「RACK1」に重なって**いました。
 *    重なっているだけなので**エラーも出ず、幅の指定は正しく効いています** —
 *    利用者からは「レイアウトが崩れている」としか見えません
 *
 *  ② **`min-width` の算数を間違えても、痩せるのは商品名だけ**です。
 *    隙間を列の数だけ掛け（正しくは 列の数 − 1）、行の左右の余白を
 *    足し忘れていたので、差し引き 20px 足りず、**商品名が 200px を
 *    割ってから**横に流れ始めていました
 *
 * だからここでは**実測した文字幅の要求**と**算数**の2つを数字で置きます。
 *
 * ── 幅の実測値の出どころ ────────────────────────────────────
 *
 * 実ブラウザ（同梱の LINE Seed JP 700 / 11px / `Badge` の既定の左右 10px）で
 * バッジの外形を測った値です:
 *
 *   映像設備 66.0（`TableBadge` が 4 字までは 62px に固定）／ カメラ設備 76.7 ／
 *   インカム設備 87.1 ／ LED/XR設備 88.7 ／ 設備/その他設備 104.0 ／
 *   ネットワーク設備 109.6
 *
 * つまり要求は **109.6px** で、寸法表の段では **128** が最小。
 */
import { describe, it, expect } from 'vitest';
import { SLOT_WIDTHS } from '../src/client/ui/row';
import { SECTIONS, TYPE_CODES } from '../../client-equipment/src/lib/constants';
import {
  ACTION_W, CHECK_W, COL_DEFS, COL_W, CUSTOM_CHECK_W, CUSTOM_COL_W, LEAD_W, NAME_MIN_PX,
  ROW_GAP, ROW_PX, customColWidth, ledgerMinWidth, sectionDisplay, type ColKey,
} from '../../client-equipment/src/pages/equipmentList/types';

/** 既定で出る列（利用者が何も触っていないとき） */
const DEFAULT_COLS = COL_DEFS.filter((c) => c.default).map((c) => c.key) as ColKey[];

/**
 * **基準の枠**（この幅に既定の列が収まること）。
 *
 * ⚠️ **これは飾りの数字ではありません。** 台帳はいちばん右の「操作」を
 * `sticky right-0` で貼り付けており、**`sticky` は必ず下の内容に重なります**。
 * 既定の合計がこの枠を超えると、**いちばん右の列は横に送るまで見えません** —
 * そして既定の右端は「貸出可」（押せるチェック）です。
 *
 * 1,254px の出どころ: ご報告のスクリーンショットから割り出した実寸です。
 * 列見出しの位置（ID 153 ／ 種別 261 ／ 設置場所 345 ／ 商品名 485px）と
 * 画像上の位置を突き合わせると倍率は 1.241 で、枠の内側は
 * (1592 − 33) / 1.241 ≒ **1,254px**（1,512px の画面 − 左メニュー 248 −
 * ページの余白 48 − スクロールバー、とも合います）。
 */
const REFERENCE_PX = 1254;

/**
 * 種別バッジの外形の実測値（上のコメント参照）。
 * **`TableBadge` は和文4字までを 62px に固定**し、それ以外は自然幅になる。
 */
const BADGE_PX: Record<string, number> = {
  映像設備: 62, 映像貸出: 62, 音声設備: 62, 音声貸出: 62, 照明設備: 62, 照明貸出: 62,
  カメラ設備: 76.7, カメラ貸出: 76.7,
  インカム設備: 87.1, インカム貸出: 87.1,
  'LED/XR設備': 88.7, 'LED/XR貸出': 88.7,
  '設備/その他設備': 104.0, '設備/その他貸出': 104.0,
  ネットワーク設備: 109.6, ネットワーク貸出: 109.6,
};

describe('列の幅', () => {
  it('全部が寸法表の7段に乗っている（この画面だけの幅を作らない）', () => {
    for (const [key, w] of Object.entries(COL_W)) {
      expect(SLOT_WIDTHS, `${key} が7段に無い`).toContain(w);
    }
    for (const [name, w] of Object.entries({ LEAD_W, CHECK_W, ACTION_W, CUSTOM_COL_W, CUSTOM_CHECK_W })) {
      expect(SLOT_WIDTHS, `${name} が7段に無い`).toContain(w);
    }
  });

  it('種別の列に、種別 × 区分の全通りのバッジが収まる（隣に重ならない）', () => {
    const labels = TYPE_CODES.flatMap((t) => SECTIONS.map((s) => sectionDisplay(t.code, s.value)));
    // 表の取りこぼしを防ぐ（種別を足したらここも足すことになる）
    for (const label of labels) expect(BADGE_PX[label], `${label} の実測値が無い`).toBeDefined();

    const widest = Math.max(...labels.map((l) => BADGE_PX[l]));
    expect(widest).toBeCloseTo(109.6, 1);
    expect(COL_W.equipment_type).toBeGreaterThanOrEqual(widest);

    // **反証**: 直す前の 72px では収まらない（＝この検査は緩くない）
    expect(labels.filter((l) => BADGE_PX[l] > 72)).toHaveLength(10);
  });
});

describe('ledgerMinWidth', () => {
  /** テストが読む側でもう一度、素直に足し直したもの */
  const naive = (cols: ColKey[], canBulkEdit: boolean, custom: number[]) => {
    const widths = [
      LEAD_W,
      ...(canBulkEdit ? [CHECK_W] : []),
      ...cols.map((k) => (k === 'name' ? NAME_MIN_PX : COL_W[k as keyof typeof COL_W])),
      ...custom,
      ACTION_W,
    ];
    return widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * ROW_GAP + ROW_PX * 2;
  };

  /** 自分で作った列を n 本ぶん、素の（チェックでない）幅で並べたもの */
  const plainCustom = (n: number) => Array.from({ length: n }, () => CUSTOM_COL_W);

  it('既定の8列: 列 ＋ 隙間 ＋ 左右の余白 を素直に足した値と一致する', () => {
    expect(ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: [] }))
      .toBe(naive(DEFAULT_COLS, true, []));
  });

  it('選ぶ四角が無いとき・自分で作った列があるときも一致する', () => {
    expect(ledgerMinWidth({ canBulkEdit: false, visibleStd: DEFAULT_COLS, customWidths: [] }))
      .toBe(naive(DEFAULT_COLS, false, []));
    expect(ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: plainCustom(3) }))
      .toBe(naive(DEFAULT_COLS, true, plainCustom(3)));
  });

  it('隙間は「列の数 − 1」。列を1つ足すと 幅 ＋ 12 だけ増える', () => {
    const base = ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: [] });
    const plus = ledgerMinWidth({
      canBulkEdit: true, visibleStd: [...DEFAULT_COLS, 'manufacturer'], customWidths: [],
    });
    expect(plus - base).toBe(COL_W.manufacturer + ROW_GAP);

    // **反証**: 隙間を列の数だけ掛けていた前の式は 20px 小さい
    //（隙間1つ多い +12 ／ 左右の余白 32 を足していない −32）
    const slots = 1 + 1 + DEFAULT_COLS.length + 1;
    const old = base - ROW_PX * 2 - (slots - 1) * ROW_GAP + slots * ROW_GAP;
    expect(base - old).toBe(20);
  });

  it('既定の列が基準の枠に収まる（右端の「貸出可」が操作の下に隠れない）', () => {
    const need = ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: [] });
    expect(need).toBeLessThanOrEqual(REFERENCE_PX);

    // **反証**: 備考を既定に戻すと収まらない（＝この検査は緩くない）
    const withNotes = ledgerMinWidth({
      canBulkEdit: true,
      visibleStd: [...DEFAULT_COLS.slice(0, -1), 'notes', 'rental'] as ColKey[],
      customWidths: [],
    });
    expect(withNotes).toBeGreaterThan(REFERENCE_PX);
  });

  it('備考は消していない。「出す列」から出せる', () => {
    expect(COL_DEFS.map((c) => c.key)).toContain('notes');
    expect(COL_DEFS.find((c) => c.key === 'notes')?.default).toBe(false);
  });

  /**
   * **チェックの列は細い。**
   *
   * 中身は四角ひとつ（20px）なので、128px で置くと**表頭ごと空白が並ぶ**だけです。
   * ご報告のスクリーンショットでは「検収／QR／Ver」の3本が出ていて、
   * それだけで **384px が空白**、そのぶん伸びる列（商品名）が最低幅の 200px まで
   * 痩せて機材名が `…` で切れていました。
   */
  it('チェックの列は 72px。素の列（128px）より 56px ずつ細い', () => {
    expect(customColWidth('checkbox')).toBe(CUSTOM_CHECK_W);
    for (const t of ['text', 'number', 'date', 'select']) {
      expect(customColWidth(t), `${t} は素の幅のまま`).toBe(CUSTOM_COL_W);
    }

    const checks = [customColWidth('checkbox'), customColWidth('checkbox'), customColWidth('checkbox')];
    const plain = ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: plainCustom(3) });
    const withChecks = ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: checks });
    // 実測どおり: チェック3本ぶんで 168px が商品名に回る
    expect(plain - withChecks).toBe(168);
  });

  it('商品名を消したら、その最低幅 200 は要求しない', () => {
    const without = DEFAULT_COLS.filter((k) => k !== 'name');
    const base = ledgerMinWidth({ canBulkEdit: true, visibleStd: DEFAULT_COLS, customWidths: [] });
    expect(ledgerMinWidth({ canBulkEdit: true, visibleStd: without, customWidths: [] }))
      .toBe(naive(without, true, []));
    expect(base - ledgerMinWidth({ canBulkEdit: true, visibleStd: without, customWidths: [] }))
      .toBe(NAME_MIN_PX + ROW_GAP);
  });
});
