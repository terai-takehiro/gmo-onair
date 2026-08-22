/**
 * ⑪ 探す の「やること」と「場所」（モックの `spSearch`）
 *
 * ── なぜ表にするのか ────────────────────────────────────────
 *
 * 画面の JSX に直接並べると、**権限の見落としがそのまま「押すと 403」**に
 * なります。行き先と必要な権限を1か所に並べておけば、
 * 追加するときに権限を書かない選択肢がありません。
 *
 * ── モックとの違い（作り話をしない） ──────────────────────────
 *
 * モックのやることは4つ（やり取りを記録／機材QR／予定を入れる／案件をつくる）、
 * 場所は6つ（お客様・お金・機材・Qシート・ふりかえり・設定）です。
 * 実際にある画面に当てると、こうなります:
 *
 * | モック | どうしたか |
 * | --- | --- |
 * | やり取りを記録 | **2つに分けた**（打合せを録音 ⑤ ／ 電話・その他を貼る ⑦）。どちらも既にある画面で、外で使う場面が違う |
 * | 予定を入れる | **「自分の予定を入れる」にした**。スタジオ予約を作るのは PC（⑬ に書いたのと同じ理由）。マイカレンダーなら自分の予定をその場で入れられる |
 * | Qシート | **「制作技術支援」**（v4 の呼び名・旧「制作資料」）。凍結は解けて v4 共通シェルにも載せ替え済み |
 *
 * ── 別のバンドルへ行くもの ──────────────────────────────────
 *
 * 機材（`/equipment`）と制作技術支援（`/qsheet`）は**別の Vite バンドル**です。
 * `navigate()` では飛べません（React Router は同じアプリの中しか知らない）。
 * `external: true` を立てて `window.location.href` で行きます。
 */
import {
  Mic, ClipboardPaste, QrCode, CalendarPlus, FolderPlus,
  Building2, Wallet, Package, FileText, History, Settings,
  type LucideIcon,
} from 'lucide-react';


export interface Shortcut {
  key: string;
  label: string;
  /** 1行の補足。**何が起きるか**を書く（行き先の名前を繰り返さない） */
  sub: string;
  to: string;
  icon: LucideIcon;
  /** 見るのに要る権限。無い人には**出さない**（押してから 403 で気づかせない） */
  module?: string;
  /** 直せる権限まで要るもの（作る・記録する） */
  minLevel?: 'reader' | 'editor';
  /** 別のバンドル。`window.location.href` で行く */
  external?: boolean;
}

/** やること — **その場で終わる仕事**だけ置く（読みに行くものは「場所」へ） */
export const DO_ITEMS: Shortcut[] = [
  { key: 'record', label: '打合せを録音する', sub: '録って AI に渡す（⑤）', to: '/sales/record', icon: Mic, module: 'sales', minLevel: 'editor' },
  { key: 'paste', label: '電話・その他を貼る', sub: '聞いた話を受付に送る（⑦）', to: '/sales/inbox/new', icon: ClipboardPaste, module: 'sales', minLevel: 'editor' },
  { key: 'scan', label: '機材の QR を読む', sub: '貸出・返却・棚卸し', to: '/equipment/scan', icon: QrCode, module: 'equipment', external: true },
  // **`/studio/my-calendar`（旧マイカレンダー）は退役した**（2026-08・v4ネイティブUI化の
  // バックログB）。① 予定はスマホでも「予定を入れる」→「自分の予定」で同じダイアログを開ける
  { key: 'myevent', label: '自分の予定を入れる', sub: 'スタジオ予約を作るのは PC', to: '/studio/calendar', icon: CalendarPlus, module: 'sales', minLevel: 'editor' },
  { key: 'newproj', label: '案件をつくる', sub: '名前とお客様だけで始められる', to: '/sales/projects/new', icon: FolderPlus, module: 'sales', minLevel: 'editor' },
];

/** 場所 — モックの6つ */
export const PLACES: Shortcut[] = [
  { key: 'customers', label: 'お客様', sub: '取引先と担当', to: '/sales/companies?role=customer', icon: Building2, module: 'sales' },
  { key: 'money', label: 'お金', sub: '売上・仕入・損益', to: '/budget/dashboard', icon: Wallet, module: 'sales' },
  { key: 'equipment', label: '機材', sub: '台帳・ラック図・貸出', to: '/equipment', icon: Package, module: 'equipment', external: true },
  { key: 'qsheet', label: '制作技術支援', sub: '台本づくりと本番進行', to: '/qsheet', icon: FileText, module: 'qsheet', external: true },
  { key: 'review', label: 'ふりかえり', sub: '営業活動のふりかえり', to: '/sales/review', icon: History, module: 'sales' },
  { key: 'settings', label: '設定', sub: '拠点・料金表・権限', to: '/settings', icon: Settings },
];
