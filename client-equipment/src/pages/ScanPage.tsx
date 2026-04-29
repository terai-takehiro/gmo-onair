import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { QrCode, Search, ArrowRight, Camera, CameraOff, AlertCircle } from "lucide-react";

const SCAN_REGION_ID = "qr-scan-region";

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [scanResult, setScanResult] = useState<{ id: string; eq_code: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ------------------------------------------------------------------
  // ID抽出: スキャン結果から eq_code を取り出す
  //   - URL形式 (例: https://onair/equipment/items/<uuid>) → 末尾の id
  //   - URL形式 (...?eq=Y-C-00001) → eq_code
  //   - "Y-C-00001" 直接 (location-type-連番5桁)
  // ------------------------------------------------------------------
  const extractCode = (raw: string): { type: 'id' | 'eq_code'; value: string } | null => {
    const text = raw.trim();
    if (!text) return null;
    // URL形式
    try {
      const u = new URL(text);
      const m = u.pathname.match(/\/equipment\/items\/([^/?#]+)/);
      if (m) return { type: 'id', value: m[1] };
      const eq = u.searchParams.get('eq');
      if (eq) return { type: 'eq_code', value: eq };
    } catch { /* not a URL */ }
    // ID直接入力 (新形式: Y-C-00001)
    if (/^[A-Z]+-[A-Z0-9]+-[0-9]{5}$/i.test(text)) {
      return { type: 'eq_code', value: text.toUpperCase() };
    }
    // UUID直接
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
      return { type: 'id', value: text };
    }
    return null;
  };

  // ------------------------------------------------------------------
  // コード解決 → 機材詳細ページ遷移
  // ------------------------------------------------------------------
  const resolveAndNavigate = async (raw: string) => {
    const parsed = extractCode(raw);
    if (!parsed) {
      setError(`認識できないコード形式: "${raw.slice(0, 50)}"`);
      return;
    }
    setError("");
    setSearching(true);
    try {
      if (parsed.type === 'id') {
        // ID → 直接遷移
        navigate(`/equipment/items/${parsed.value}`);
        return;
      }
      // eq_code → サーバーlookup
      const res = await api.get(`/equipment/items/by-code/${parsed.value}`);
      const item = res.data?.data;
      if (item?.id) {
        setScanResult(item);
        navigate(`/equipment/items/${item.id}`);
      } else {
        setError(`ID "${parsed.value}" の機材が見つかりません`);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        .response?.data?.error?.message;
      setError(msg || `機材が見つかりません: ${parsed.value}`);
    } finally {
      setSearching(false);
    }
  };

  // ------------------------------------------------------------------
  // カメラスキャナー起動/停止
  // ------------------------------------------------------------------
  const startCamera = async () => {
    setError("");
    try {
      const scanner = new Html5Qrcode(SCAN_REGION_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' }, // 背面カメラ優先
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // 一致したら即停止 → 詳細ページへ
          scanner.stop().catch(() => {});
          setCameraOn(false);
          resolveAndNavigate(decodedText);
        },
        () => { /* スキャン失敗フレームは無視 */ },
      );
      setCameraOn(true);
    } catch (err) {
      setError(`カメラを起動できません: ${err instanceof Error ? err.message : String(err)}`);
      setCameraOn(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
      await scannerRef.current.stop().catch(() => {});
    }
    setCameraOn(false);
  };

  // unmount時にカメラ停止
  useEffect(() => {
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSearch = () => {
    if (!manualCode.trim()) return;
    resolveAndNavigate(manualCode.trim());
  };

  return (
    <div className="space-y-4 p-4 lg:p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="heading-page text-xl lg:text-2xl">QRスキャン</h1>
        <p className="text-sm text-muted-foreground">
          カメラでQRコードを読み取るか、IDを直接入力
        </p>
      </div>

      {/* ── カメラスキャナー ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <span className="font-medium">カメラ</span>
            </div>
            {cameraOn ? (
              <Button size="sm" variant="outline" onClick={stopCamera}>
                <CameraOff className="h-4 w-4 mr-1" />
                停止
              </Button>
            ) : (
              <Button size="sm" onClick={startCamera}>
                <Camera className="h-4 w-4 mr-1" />
                スキャン開始
              </Button>
            )}
          </div>
          <div
            id={SCAN_REGION_ID}
            className="w-full rounded-lg overflow-hidden border bg-muted"
            style={{ minHeight: cameraOn ? 280 : 0 }}
          />
          {!cameraOn && (
            <p className="text-xs text-muted-foreground text-center py-2">
              「スキャン開始」をタップしてカメラを起動。背面カメラで機材のQRコードを読み取ります。
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 手動入力 ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="h-5 w-5 text-primary" />
            <span className="font-medium">ID入力</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSearch(); }}
              placeholder="Y-C-00001"
              className=" text-base"
            />
            <Button onClick={handleManualSearch} disabled={searching}>
              <Search className="h-4 w-4 mr-1" />
              検索
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── エラー表示 ── */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* ── スキャン結果プレビュー ── */}
      {scanResult && (
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-primary"
          onClick={() => navigate(`/equipment/items/${scanResult.id}`)}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className=" text-sm text-primary">{scanResult.eq_code}</span>
              <h3 className="font-medium">{scanResult.name}</h3>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* ── 使い方ガイド ── */}
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">使い方</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>機材詳細ページから「QRコード印刷」でQRシールを生成・貼付</li>
            <li>本ページで「スキャン開始」→ カメラでQRを読み取り → 自動で機材詳細へ</li>
            <li>QRが読めない場合は手動でIDを入力</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
