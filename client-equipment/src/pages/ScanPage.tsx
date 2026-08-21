/**
 * ⑥ QRスキャン (v4)
 *
 * 機材に貼った QR を読んで、その機材の詳細を開きます。
 * 読み取れないときは ID を打ちます。
 *
 * **カメラの制御 (html5-qrcode) は1行も変えていません** — 端末ごとに挙動が違い、
 * 見た目の作り直しと同じ回で触ると原因の切り分けができなくなるためです。
 *
 * ── PC / スマホで構成そのものを変えた（v4 ネイティブUI監査 2026-08-20） ──
 *
 * 監査で見つかった不足点は2つ:
 * ①読み取り履歴が汎用 Row リストの流用でカード積みになっていない
 * ②PC・スマホで画面構成に差が無い（同じ1カラムを両方に出している）
 *
 * → **薄い親でカメラ制御・履歴取得を1回だけ持ち**（`useScanner` / `useScanHistory`）、
 * 見た目は `ScanPageDesktop` / `ScanPageMobile` に丸ごと入れ替える
 * （`useIsMobile()` は薄い親で1回だけ呼ぶ — 同じ部品の中で早期 return しない）。
 * 履歴の見た目も PC は `ScanHistoryRows`（`Row` の表）・スマホは
 * `ScanHistoryCards`（カード積み・見つかった/見つからないを色と印で先に見分けられる）
 * に分けた（`pages/scan/` 配下）。
 *
 * ── 読み取り履歴 (モックどおり・migration 168) ────────────────
 *
 * 読んだものは `equipment_scans` に残り、下に新しい順で出ます。
 *
 * **見つからなかった読み取りも残します。** 見つかったものだけ残すと、
 * 「読めないシールがある」ことに誰も気づけません。履歴では「見つかりません」と
 * 出るので、貼り直しの手がかりになります。
 *
 * 履歴に残すのは**読み取りに成功したあと**（＝形として読めた文字列）。
 * カメラのブレで拾った断片まで残すと、履歴が読めなくなります。
 *
 * その場での貸出・返却はまだです（貸出は相手と用途と期日が要るので、
 * 読んだ流れで済ませるには入力の設計から）。
 */
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useScanner } from './scan/useScanner';
import { useScanHistory } from './scan/useScanHistory';
import { ScanPageDesktop } from './scan/ScanPageDesktop';
import { ScanPageMobile } from './scan/ScanPageMobile';

export default function ScanPage() {
  const isMobile = useIsMobile();
  const scanner = useScanner();
  const { rows, isLoading } = useScanHistory();

  return isMobile
    ? <ScanPageMobile scanner={scanner} rows={rows} isLoading={isLoading} />
    : <ScanPageDesktop scanner={scanner} rows={rows} isLoading={isLoading} />;
}
