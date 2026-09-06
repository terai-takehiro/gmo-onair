/**
 * ⑥ QRスキャン — PC
 *
 * 「カメラ・ID入力・使いかた・履歴」を縦に並べた書類のような構成
 * （元の `ScanPage.tsx` の見た目のまま。スマホ版は `ScanPageMobile.tsx`）。
 */
import { AlertCircle, Camera, CameraOff, Loader2, QrCode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import type { ScannerState } from './useScanner';
import { SCAN_REGION_ID } from './useScanner';
import { ScanHistoryRows } from './ScanHistoryRows';
import type { ScanRow } from './useScanHistory';

export function ScanPageDesktop({
  scanner, rows, isLoading,
}: {
  scanner: ScannerState;
  rows: ScanRow[];
  isLoading: boolean;
}) {
  const { error, cameraOn, searching, manualCode, setManualCode, startCamera, stopCamera, submitManual } = scanner;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <PageHeader
        title="QRスキャン"
        sub="機材に貼った QR を読むと、その機材の詳細が開きます"
        primaryAction={
          cameraOn ? (
            <Button variant="outline" onClick={stopCamera}>
              <CameraOff className="mr-1 h-4 w-4" aria-hidden="true" />止める
            </Button>
          ) : (
            <Button onClick={startCamera}>
              <Camera className="mr-1 h-4 w-4" aria-hidden="true" />カメラで読む
            </Button>
          )
        }
      />

      {error && (
        <p className="flex items-start gap-2 rounded-note border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="rounded-card border border-border bg-card p-4">
        <div
          id={SCAN_REGION_ID}
          className="w-full overflow-hidden rounded-control border border-border bg-muted"
          style={{ minHeight: cameraOn ? 280 : 0 }}
        />
        {!cameraOn && (
          <p className="py-2 text-center text-sub text-muted-foreground">
            「カメラで読む」を押すと背面カメラが立ち上がります。
            機材の QR にかざすと、そのまま詳細が開きます。
          </p>
        )}
      </div>

      <div className="rounded-card border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-cardtitle">機材IDを入力</h2>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="eq-code-input" className="sr-only">機材ID</Label>
            <Input
              id="eq-code-input"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && manualCode.trim()) submitManual(); }}
              placeholder="Y-C-00001"
              className="font-number"
            />
          </div>
          <Button onClick={submitManual} disabled={searching || !manualCode.trim()}>
            {searching
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Search className="mr-1 h-4 w-4" aria-hidden="true" />}
            探す
          </Button>
        </div>
      </div>

      <div className="rounded-note border border-info-border bg-info-surface p-4">
        <p className="text-cardtitle text-foreground">使い方</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-note text-secondary-foreground">
          <li>機材の詳細から「QRコードを印刷」でシールを作って貼る</li>
          <li>この画面で「カメラで読む」→ QR にかざす → 機材の詳細が開く</li>
          <li>QR が読めないときは 機材IDを入力</li>
        </ol>
        <p className="mt-2 text-note text-secondary-foreground">
          読んだものは下に残ります。
          <strong className="font-bold">その場での貸出・返却はまだありません</strong>
          （相手と用途と期日が要るため）。貸出と返却は「貸出・返却」から記録します。
        </p>
      </div>

      <ScanHistoryRows rows={rows} isLoading={isLoading} />
    </div>
  );
}
