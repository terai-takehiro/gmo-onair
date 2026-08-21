/**
 * ⑥ QRスキャン — スマホ
 *
 * PC 版（`ScanPageDesktop.tsx`）は「カメラ・ID入力・使いかた」の3枚を縦に並べた
 * 書類のような構成だが、スマホは**現場でカメラをかざす画面**なので構成そのものを変える:
 *
 * - **カメラの枠を先に大きく出す。** PC は説明文が枠の中にあるが、
 *   スマホは読む前から迷わないよう枠自体を主役にする
 * - **ID を打つのは畳んでおく。** 現場ではまずカメラで読むのが基本
 *   （棚卸しの `MobileScanSession.tsx` と同じ「まず読む・要るときだけ手で打つ」の考え方）
 * - **使いかたは畳んだ帯にする。** 毎回同じ3行を読ませない — 現場で迷ったときだけ開く
 * - **履歴はカード積み**（`ScanHistoryCards.tsx`）。PC の `Row` 表をそのまま縮めない
 */
import { useState } from 'react';
import { AlertCircle, Camera, CameraOff, ChevronDown, Keyboard, Loader2, QrCode, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ScannerState } from './useScanner';
import { SCAN_REGION_ID } from './useScanner';
import { ScanHistoryCards } from './ScanHistoryCards';
import type { ScanRow } from './useScanHistory';

export function ScanPageMobile({
  scanner, rows, isLoading,
}: {
  scanner: ScannerState;
  rows: ScanRow[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const [manualOpen, setManualOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const { error, cameraOn, searching, manualCode, setManualCode, startCamera, stopCamera, submitManual } = scanner;

  return (
    <div className="flex flex-col gap-3 p-3">
      <PageHeader
        title="QRスキャン"
        sub="機材の QR を読むと、その機材の詳細が開きます"
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

      {/* カメラの枠を主役にする（PC と違い、枠の中に説明文を置かない） */}
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div
          id={SCAN_REGION_ID}
          className="w-full overflow-hidden bg-muted"
          style={{ minHeight: cameraOn ? 320 : 220 }}
        />
        {!cameraOn && (
          <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
            <QrCode className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sub text-muted-foreground">
              下の「カメラで読む」を押すと、機材の QR を読み取れます。
            </p>
          </div>
        )}
      </div>

      {/* ID を打つ — 畳んでおく。現場ではまずカメラで読むのが基本 */}
      <div className="rounded-card border border-border bg-card">
        <button
          type="button"
          className="flex min-h-tap w-full items-center gap-2 px-4 py-3 text-left"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
        >
          <Keyboard className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-cardtitle flex-1">ID を打つ</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', manualOpen && 'rotate-180')} aria-hidden="true" />
        </button>
        {manualOpen && (
          <form
            className="flex gap-2 px-4 pb-4"
            onSubmit={(e) => { e.preventDefault(); submitManual(); }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="eq-code-input-m" className="sr-only">機材ID</Label>
              <Input
                id="eq-code-input-m"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Y-C-00001"
                autoFocus
                className="h-11 font-number"
              />
            </div>
            <Button type="submit" disabled={searching || !manualCode.trim()}>
              {searching
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Search className="mr-1 h-4 w-4" aria-hidden="true" />}
              探す
            </Button>
          </form>
        )}
      </div>

      {/* 使いかた — 畳んだ帯。毎回3行を読ませない */}
      <div className="rounded-note border border-info-border bg-info-surface">
        <button
          type="button"
          className="flex min-h-tap w-full items-center gap-2 px-4 py-2.5 text-left"
          onClick={() => setTipsOpen((v) => !v)}
          aria-expanded={tipsOpen}
        >
          <span className="text-sub flex-1 text-foreground">使いかた</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', tipsOpen && 'rotate-180')} aria-hidden="true" />
        </button>
        {tipsOpen && (
          <div className="px-4 pb-3">
            <ol className="list-decimal space-y-1 pl-5 text-note text-secondary-foreground">
              <li>機材の詳細から「QRコードを印刷」でシールを作って貼る</li>
              <li>この画面で「カメラで読む」→ QR にかざす → 機材の詳細が開く</li>
              <li>QR が読めないときは ID を打つ</li>
            </ol>
            <p className="mt-2 text-note text-secondary-foreground">
              読んだものは下に残ります。
              <strong className="font-bold">その場での貸出・返却はまだありません</strong>
              （貸出と返却は「貸出・返却」から記録します）。
            </p>
          </div>
        )}
      </div>

      <ScanHistoryCards
        rows={rows}
        isLoading={isLoading}
        onOpen={(equipmentId) => navigate(`/equipment/items/${equipmentId}`)}
      />
    </div>
  );
}
