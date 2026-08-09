/**
 * 営業活動の種類 (`/sales/activity-logs`)
 *
 * ── なぜ画面から出したのか ──────────────────────────────────
 *
 * `ActivityLogPage.tsx` は 1 ファイル 400 行の上限を大きく超えているので、
 * **足すときは分ける**のが決めです（`scripts/check-file-size.mjs`）。
 * 種類の表は画面の描き方と関係が無く、いちばん外に出しやすい部分でした。
 *
 * ── DB の CHECK と同じ集合にすること ────────────────────────
 *
 * `activity_logs.activity_type`（migration 184）・MCP の `ACTIVITY_TYPES`・
 * この表の3か所が同じでないと、**片方から登録できるのに別の口で弾かれます**。
 * `memo` は相手とのやり取りではない社内の書き置きで、
 * migration 184 で案件のメモ（旧 `projects.notes`）をここに畳みました。
 */
export const ACTIVITY_TYPES = [
  { value: 'call', label: '電話', color: 'bg-blue-100 text-blue-700' },
  { value: 'email', label: 'メール', color: 'bg-green-100 text-green-700' },
  { value: 'visit', label: '訪問', color: 'bg-purple-100 text-purple-700' },
  { value: 'meeting', label: '打合せ', color: 'bg-orange-100 text-orange-700' },
  { value: 'proposal', label: '提案', color: 'bg-red-100 text-red-700' },
  { value: 'demo', label: 'デモ/見学', color: 'bg-pink-100 text-pink-700' },
  { value: 'follow_up', label: 'フォロー', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'memo', label: 'メモ', color: 'bg-slate-100 text-slate-700' },
  { value: 'other', label: 'その他', color: 'bg-gray-100 text-gray-700' },
];

/**
 * 知らない種類は「その他」に落とす。
 *
 * **末尾を番号で指さないこと。** 元は `ACTIVITY_TYPES[7]` と書いてあり、
 * `memo` を1つ足しただけで**知らない種類が「メモ」と表示される**ようになりました。
 */
export const getActivityType = (value: string) =>
  ACTIVITY_TYPES.find((t) => t.value === value)
  ?? ACTIVITY_TYPES.find((t) => t.value === 'other')!;
