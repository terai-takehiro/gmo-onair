/**
 * ⑥ QRスキャン (v4)
 *
 * 機材に貼った QR を読んで、その機材の詳細を開きます。
 * 読み取れないときは ID を打ちます。
 *
 * **カメラの制御 (html5-qrcode) は1行も変えていません** — 端末ごとに挙動が違い、
 * 見た目の作り直しと同じ回で触ると原因の切り分けができなくなるためです。
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
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Camera, CameraOff, History, Loader2, QrCode, Search } from 'lucide-react';
import api from '@/lib/api';
import { extractCode } from '@/lib/qrCode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';

const SCAN_REGION_ID = 'qr-scan-region';

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [searching, setSearching] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qc = useQueryClient();

  const resolveAndNavigate = async (raw: string) => {
    const parsed = extractCode(raw);
    if (!parsed) {
      setError(`読み取れない形でした: "${raw.slice(0, 50)}"`);
      return;
    }
    setError('');
    setSearching(true);
    // **履歴に残す。** 失敗しても読み取りそのものは止めない（記録は副次）
    api.post('/equipment/scans', { raw_code: parsed.value, action: 'lookup' })
      .then(() => qc.invalidateQueries({ queryKey: ['equipment-scans'] }))
      .catch(() => { /* 履歴が残らなくても機材は開けるようにする */ });
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
          読んだものは下に残ります。
          <strong className="font-bold">その場での貸出・返却はまだありません</strong>
          （相手と用途と期日が要るため）。貸出と返却は「貸出・返却」から記録します。
        </p>
      </div>

      <ScanHistory />
    </div>
  );
}

/**
 * さっき読んだもの。**自分のぶんだけ**を出します —
 * 現場では「いま自分が読んだ機材」を確かめたいので、他の人のぶんが混ざると読めません。
 */
function ScanHistory() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['equipment-scans'],
    queryFn: async () =>
      (await api.get('/equipment/scans', { params: { mine: 1, limit: 20 } })).data.data as ScanRow[],
    staleTime: 10_000,
  });

  const rows = data ?? [];

  return (
    <section className="flex flex-col gap-2" aria-labelledby="scan-history">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="scan-history" className="text-h2">さっき読んだもの</h2>
        <span className="text-sub text-muted-foreground">自分のぶん・新しい順</span>
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState title="まだ読んでいません" description="カメラで読むか、ID を打つとここに残ります。" />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          {rows.map((r) => (
            <Row
              key={r.id}
              divider
              interactive={!!r.equipment_id}
              onClick={r.equipment_id ? () => navigate(`/equipment/items/${r.equipment_id}`) : undefined}
            >
              <RowMain>
                <RowTitle>
                  {r.equipment_name ?? (
                    // **見つからなかったことを書く。** 消すと「読めないシール」に気づけない
                    <span className="text-warning">見つかりませんでした</span>
                  )}
                </RowTitle>
                <RowSub>
                  <span className="font-number">{r.raw_code}</span>
                  {r.unit_number != null && ` ・ No.${r.unit_number}`}
                </RowSub>
              </RowMain>
              <RowSlot w={96} align="right">
                <span className="font-number text-sub-sm text-muted-foreground">{hm(r.scanned_at)}</span>
              </RowSlot>
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}

interface ScanRow {
  id: string;
  raw_code: string;
  equipment_id: string | null;
  equipment_name: string | null;
  unit_number: number | null;
  scanned_at: string;
}

/** `2026-08-07T13:04:…` → `13:04`。同じ日に何度も読むので時刻だけでよい */
function hm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
