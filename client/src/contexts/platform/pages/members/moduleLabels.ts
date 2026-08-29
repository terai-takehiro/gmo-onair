/**
 * 権限の区画のラベル（v4 設定 ③ 権限とメンバー）
 *
 * ── ブロックアプリ単位に統合した（権限モデル単純化）─────────────
 *
 * 以前は実装の区画が12（`sales`/`budget`/`gpm`/`studio`/`partner_schedule`/
 * `equipment`/`dailyops`/`admin`/`qsheet`/`techsheet`/`liveops`/`awards`）あり
 * （その後 `techsheet` は技術資料アプリの削除で無くなった）、
 * モックの「役割5種 × 権限8項目」ともズレていて分かりにくかった。
 * ユーザーの指示（「アプリ単位で使える／使えないでいい」）を受けて、
 * `sales`/`budget`/`gpm`/`studio`/`partner_schedule` の5区画を**すべて `sales`
 * に統合**し、「案件管理・財務管理・カレンダー・設定」という1つのブロックアプリを
 * 1つの区画で表す形にした。`admin`（権限とメンバーの管理）は区画そのものを
 * 廃止し、`system_admin` ロールだけに絞った（型の manager レベルでも触れない）。
 *
 * 詳細は `docs/reviews/permission-model-simplification-plan.md`。
 *
 * ── なぜ経理／営業の区別が無くなったのか ──────────────────────
 *
 * 旧「経理」型は `budget=editor` だが `sales=reader`、旧「営業担当」型は逆、
 * という組み合わせで区別していたが、実際の運用は「原則チームメンバーは
 * フルアクセス（会社の指示）」で、区画を分けて使い分ける場面が無かった。
 * 一部の人だけ特定のアプリに絞って渡す（機材情報だけ、など）という
 * **例外の運用のほうが実態**だったため、型は「フルアクセス」1つを基本にし、
 * 絞りたいときだけ個別の型を作る形にした。
 *
 * ── 凍結アプリも型の対象にした ───────────────────────────────
 *
 * 以前は `qsheet` / `techsheet` / `liveops` / `awards` は型の対象外で、
 * 個人ごとの例外設定でしか付けられなかった。個人ごとの例外編集そのものを
 * 廃止した（「型だけ」の方針）ため、凍結アプリも型の対象に含めている。
 * `techsheet` は技術資料アプリの削除（migration 211）で外した。
 *
 * ── `liveops` を `qsheet` へ統合した（計時・視聴者のミニアプリ化フェーズ2）──
 *
 * 計時・視聴者は別区画 `liveops` を持っていたが、ミニアプリ化フェーズ2の着手に
 * あたり `qsheet` に統合した（migration 232・12-live-timer-decision.md §9 の
 * 未決事項に対する決定）。`MODULE_WHAT.qsheet` に計時・視聴者を含める旨を足し、
 * `MODULE_WHAT.liveops` は削除した。
 */

/** 役割の表に出す区画。**サーバーの `ROLE_MODULES` と同じ並び** */
export const ROLE_MODULE_ORDER = [
  'sales', 'equipment', 'dailyops', 'qsheet', 'awards',
] as const;

/** 個人の例外編集は廃止したので、いまは役割の表と同じ */
export const ALL_MODULE_ORDER = ROLE_MODULE_ORDER;

/**
 * 役割の表に出す見出し。**`sales` だけ上書きする** — `AuthContext.MODULE_LABELS`
 * の `sales` は「案件管理」（アプリ切替の名前）だが、この区画はいまや
 * 財務管理・カレンダー・プロジェクト管理も含む。他の区画はアプリ名のままでよい
 * ので `MODULE_LABELS` にフォールバックする。
 * `qsheet` は techops 改名で `APP_LABELS` のキーが `techops` になり
 * フォールバックが外れる（区画キーは `qsheet` のまま）ため、ここで持つ。
 */
export const MODULE_TITLE: Record<string, string> = {
  sales: '案件管理・財務・カレンダー',
  qsheet: '制作技術支援',
};

/** 何ができる区画なのかを業務の言葉で */
export const MODULE_WHAT: Record<string, string> = {
  sales: '案件・見積・工程とタスク・料金表・請求・入金・売上・仕入・販管費・スタジオの予約・カレンダー・プロジェクト管理',
  equipment: '機材の台帳と貸出',
  dailyops: '週報・ニュース・内覧会・受領書類',
  qsheet: '制作技術支援（Qシート・計時・視聴者）',
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
