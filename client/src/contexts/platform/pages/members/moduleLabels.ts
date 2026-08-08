/**
 * 権限の区画のラベル（v4 設定 ③ 権限とメンバー）
 *
 * ── なぜモックの 8 項目をそのまま使わないのか ───────────────
 *
 * モックの `PERM_LABELS` は
 *   案件の作成・編集 / 見積の作成・編集 / 工程とタスク / 予約（スタジオ）/
 *   機材の貸出 / 請求・入金 / 料金表マスター / 権限とメンバー
 * の 8 行ですが、**このうち 4 つは実装ではすべて同じ `sales` 権限**です
 * （案件・見積・工程・料金表）。8 行に分けて出すと、「見積だけ見るだけに
 * した」つもりで案件も工程も料金表も同時に変わります。
 * **押した覚えのないものが変わるほうが害が大きい**ので、行は実装の区画に
 * 合わせ、ラベルだけモックの言い方に寄せます。
 *
 * ── 凍結4アプリはここに出さない ─────────────────────────────
 *
 * `qsheet` / `techsheet` / `liveops` / `awards` は役割の担当範囲の外です
 * （`permission-role.service.ts` の `ROLE_MODULES`）。役割の画面に出すと
 * 「役割で決まる」と読めてしまうので出しません。個人の例外の画面には出ます
 * — そちらが唯一の付け外しの場所になるためです。
 */

/** 役割の表に出す区画。**サーバーの `ROLE_MODULES` と同じ並び** */
export const ROLE_MODULE_ORDER = [
  'sales', 'budget', 'gpm', 'studio', 'partner_schedule', 'equipment', 'dailyops', 'admin',
] as const;

/** 個人の例外の画面に出す区画（凍結4アプリを含む全部） */
export const ALL_MODULE_ORDER = [
  ...ROLE_MODULE_ORDER, 'qsheet', 'techsheet', 'liveops', 'awards',
] as const;

/** 何ができる区画なのかを業務の言葉で。モックの 8 項目の言い方に寄せてある */
export const MODULE_WHAT: Record<string, string> = {
  sales: '案件・見積・工程とタスク・料金表',
  budget: '請求・入金・売上・仕入・販管費',
  gpm: 'プロジェクトの工程と未確認事項',
  studio: 'スタジオの予約とカレンダー',
  partner_schedule: 'パートナーの予定',
  equipment: '機材の台帳と貸出',
  dailyops: '週報・ニュース・内覧会・受領書類',
  admin: '権限とメンバー・システムの情報',
  qsheet: '制作資料（Qシート）',
  techsheet: '技術資料',
  liveops: '計時LIVE',
  awards: 'リアルタイムCG',
};

/** 3段。`ACCESS_LEVEL_LABELS` と同じ値だが、役割の表は「なし」を含む4択で出す */
export const LEVEL_CHOICES = [
  { value: 'none', label: 'なし', hint: 'この区画は開けません' },
  { value: 'reader', label: '見るだけ', hint: '参照・CSV 出力' },
  { value: 'editor', label: '直せる', hint: '追加・編集' },
  { value: 'manager', label: '管理', hint: '追加・編集・削除・設定' },
] as const;

export const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  LEVEL_CHOICES.map((c) => [c.value, c.label]),
);

/** 段ごとの色。`none` だけ地味にして、付いていないことが一目で分かるようにする */
export const LEVEL_TONE: Record<string, string> = {
  none: 'bg-muted text-muted-foreground',
  reader: 'bg-info-surface text-info',
  editor: 'bg-primary-surface text-primary',
  manager: 'bg-warning-surface text-warning',
};
