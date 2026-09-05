/**
 * ② 機材台帳 ／ 貸出機材 の型 (旧 `ModelGroupPage.tsx` から切り出し)
 *
 * 貸出機材は**型名ごとにまとめた塊**で並びます (同じ機種が10台あっても1行)。
 * 開くと1台ずつの状態が出ます。
 */
export interface RentalChild {
  id: string;
  eq_code: string;
  name: string;
  unit_number: number | null;
  status: string;
}

export interface RentalUnit {
  id: string;
  eq_code: string;
  unit_number: number | null;
  serial_number: string | null;
  status: string;
  condition: string;
  location_name: string | null;
  location_detail: string | null;
  rental_display_name: string | null;
  children: RentalChild[];
}

export interface ModelGroup {
  name: string;
  model_number: string;
  manufacturer_name: string | null;
  equipment_type_code: string;
  rental_category_id: string | null;
  rental_category_name: string | null;
  rental_category_sort_order: number | null;
  rental_display_name: string | null;
  total_count: number;
  units: RentalUnit[];
}

export interface RentalCategory { id: string; name: string; sort_order: number }

export interface CategorySection {
  id: string | null;
  name: string;
  sort_order: number;
  groups: ModelGroup[];
}

export const groupKey = (g: ModelGroup) => `${g.name}::${g.model_number}::${g.equipment_type_code}`;

/**
 * 高さを覚えるときの鍵。**開いているかどうかを含める。**
 *
 * ⚠️ 型名だけを鍵にすると、**開いて背が高くなったときの実寸を、
 * 閉じたあとも使い続けます**。閉じた塊が画面の外にあるあいだは測り直せないので、
 * **一覧の高さが縮まず、スクロールバーが伸びたまま**になります
 * （実測: 開いて閉じたのに 55,443px → 55,537px のまま戻らなかった）。
 */
export const rentalRowKey = (key: string, expanded: boolean) => `${key}|${expanded ? 'o' : 'c'}`;

/** 状態の色。**引退・廃棄・紛失は「危ない」ではなく「もう使わない」**なので灰にする */
export const UNIT_STATUS_TONE: Record<string, string> = {
  active: 'bg-success-surface text-success border-transparent',
  in_repair: 'bg-warning-surface text-warning border-transparent',
  retired: 'bg-muted text-muted-foreground border-transparent',
  disposed: 'bg-muted text-muted-foreground border-transparent',
  lost: 'bg-destructive-surface text-destructive border-transparent',
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  active: '稼働中', in_repair: '修理中', retired: '休止', disposed: '廃棄', lost: '紛失',
};

// ───────────────────────────────────────────────────────
// 高さの見積もり（見えている塊だけ描くために要る）
// ───────────────────────────────────────────────────────

/**
 * 実ブラウザで測った寸法（1440px）。**まだ描いていない塊の高さを出す土台**です。
 *
 *   畳んだカード 64.25 ／ 開いたときの区切り線 1 ／ 1台ぶんの行 62.25
 *
 * ⚠️ **畳んだカードの高さは実測で置き換わります**（`useVarRowWindow` が
 * いちばん低い実測値を返す）。スマホでは行が折り返して背が高くなるので、
 * ここを決め打ちのまま使うと**送るほどスクロールバーが伸びます**。
 * ここにあるのは「1枚も描く前」の初手だけです。
 */
export const RENTAL_CARD_H = 64.25;
/** 開いたときに上に入る区切り線（`border-t`） */
export const RENTAL_OPEN_BORDER_H = 1;
/** 開いたときの1台ぶんの行 */
export const RENTAL_UNIT_H = 62.25;
/** 台の下に出る「↳ 付属品」の1行。**折り返すと伸びる**ので実測で上書きされる */
export const RENTAL_KIDS_H = 26;

/**
 * 型名ごとの塊1つぶんの高さ。
 *
 * **数式で出せることが大事**です。実測だけに頼ると、描いていない塊の高さが
 * 分からないので「すべて開く」を押した瞬間に正しい長さにならず、
 * **送るほどスクロールバーが伸びていきます**（いまの見え方と変わる）。
 *
 * @param cardH 畳んだカード1枚の高さ。実測が取れていればそれを渡す
 */
export function rentalGroupHeight(g: ModelGroup, expanded: boolean, cardH = RENTAL_CARD_H): number {
  if (!expanded) return cardH;
  let h = cardH + RENTAL_OPEN_BORDER_H;
  for (const u of g.units) {
    h += RENTAL_UNIT_H + ((u.children?.length ?? 0) > 0 ? RENTAL_KIDS_H : 0);
  }
  return h;
}
