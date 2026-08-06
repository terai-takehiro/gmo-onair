/**
 * ⑥ QRスキャン (v4)
 *
 * 機材に貼った QR を読んで、その機材の詳細を開きます。
 * 読み取れないときは ID を打ちます。
 *
 * **カメラの制御 (html5-qrcode) は1行も変えていません** — 端末ごとに挙動が違い、
 * 見た目の作り直しと同じ回で触ると原因の切り分けができなくなるためです。
 *
 * ── モックにあって作らなかったもの ────────────────────────
 *
 * モックには「読み取り履歴」と、その場で貸出・返却を付ける機能がありますが、
 * **読み取りを残すテーブルがありません**。履歴を出すには
 * 「いつ・誰が・何を読んだか」を保存する場所が要るので、この回では作らず
 * **無いことを画面に書いています**。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { AlertCircle, Camera, CameraOff, Loader2, QrCode, Search } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';

const SCAN_REGION_ID = 'qr-scan-region';

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [searching, setSearching] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  /**
   * 読み取った文字から機材を割り出す。
   *   URL (`…/equipment/items/<uuid>`) → id ／ `?eq=Y-C-00001` → 機材ID
   *   `Y-C-00001` 直接 ／ UUID 直接
   */
  const extractCode = (raw: string): { type: 'id' | 'eq_code'; value: string } | null => {
    const text = raw.trim();
    if (!text) return null;
    try {
      const u = new URL(text);
      const m = u.pathname.match(/\/equipment\/items\/([^/?#]+)/);
      if (m) return { type: 'id', value: m[1] };
      const eq = u.searchParams.get('eq');
      if (eq) return { type: 'eq_code', value: eq };
    } catch { /* URL ではない */ }
    if (/^[A-Z]+-[A-Z0-9]+-[0-9]{5}$/i.test(text)) return { type: 'eq_code', value: text.toUpperCase() };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return { type: 'id', value: text };
    return null;
  };

  const resolveAndNavigate = async (raw: string) => {
    const parsed = extractCode(raw);
    if (!parsed) {
      setError(`読み取れない形でした: "${raw.slice(0, 50)}"`);
      return;
    }
    setError('');
    setSearching(true);
    try {
      if (parsed.type === 'id') {
        navigate(`/equipment/items/${parsed.value}`);
        return;
      }
      const res = await api.get(`/equipment/items/by-code/${parsed.value}`);
      const item = res.data?.data;
      if (item?.id) navigate(`/equipment/items/${item.id}`);
      else setError(`ID「${parsed.value}」の機材が見つかりません`);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      setError(msg || `機材が見つかりません: ${parsed.value}`);
    } finally {
      setSearching(false);
    }
  };

  const startCamera = async () => {
    setError('');
    try {
      const scanner = new Html5Qrcode(SCAN_REGION_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          setCameraOn(false);
          resolveAndNavigate(decodedText);
        },
        () => { /* 読めなかったコマは無視 */ },
      );
      setCameraOn(true);
    } catch (err) {
      setError(`カメラを使えませんでした: ${err instanceof Error ? err.message : String(err)}`);
      setCameraOn(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
      await scannerRef.current.stop().catch(() => {});
    }
    setCameraOn(false);
  };

  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-3 lg:gap-5 lg:p-6">
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
          <h2 className="text-cardtitle">ID を打つ</h2>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="eq-code-input" className="sr-only">機材ID</Label>
            <Input
              id="eq-code-input"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && manualCode.trim()) resolveAndNavigate(manualCode.trim()); }}
              placeholder="Y-C-00001"
              className="font-number"
            />
          </div>
          <Button
            onClick={() => manualCode.trim() && resolveAndNavigate(manualCode.trim())}
            disabled={searching || !manualCode.trim()}
          >
            {searching
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Search className="mr-1 h-4 w-4" aria-hidden="true" />}
            探す
          </Button>
        </div>
      </div>

      <div className="rounded-note border border-info-border bg-info-surface p-4">
        <p className="text-cardtitle text-foreground">使いかた</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-note text-secondary-foreground">
          <li>機材の詳細から「QRコードを印刷」でシールを作って貼る</li>
          <li>この画面で「カメラで読む」→ QR にかざす → 機材の詳細が開く</li>
          <li>QR が読めないときは ID を打つ</li>
        </ol>
        <p className="mt-2 text-note text-secondary-foreground">
          <strong className="font-bold">読み取りの履歴と、その場での貸出・返却はまだありません。</strong>
          読んだ記録を残す場所がないので作っていません。貸出と返却は「貸出・返却」から記録します。
        </p>
      </div>
    </div>
  );
}
