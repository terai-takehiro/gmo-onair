/**
 * ⑨ 機材の確認（現場で・スマホ・モックの端末枠 9枚目）
 *
 * ── モックの端末枠 ──────────────────────────────────────────
 *
 *   `QRを読んで…` ／ 確認できた 412 ・ 見つからない 3 ・ のこり 189 ／
 *   手で入れる ・ 見つからない一覧 ・ 中断する
 *
 * ── なぜ「貸出」ではなく「棚卸し」に載せたか ────────────────
 *
 * 枠の題は「貸出・返却」ですが、**中の数字は棚卸しのもの**です
 * （確認できた / 見つからない / のこり ＝ 決まった一覧を1つずつ潰していく形。
 * 412+3+189 = 604 は倉庫まるごとの数で、現場に持ち出す量ではありません）。
 *
 * そして**この形にしか安全に載せられません**。理由は二重登録です:
 *
 *   棚卸しの記録 何回押しても結果が同じ（確認できた / 見つからない）→ 溜めて送れる
 *   返却の記録   返ったものをもう一度返しても返ったまま      → 溜めて送れる
 *   **貸出**     2回押すと**2本できる**                      → 溜めて送れない
 *
 * 貸出は相手・用途・期日が要る入力でもあるので、
 * **この画面には載せません**（`ScanPage` の但し書きと同じ判断）。
 * 画面にもそう書いてあります。
 *
 * ── 電波が弱い前提（モックの決めごと） ──────────────────────
 *
 *   > 現場の記録は端末に溜めて後で送る。送信中も操作を止めない
 *   > やってはいけない例: 1件ごとに通信して失敗で止まる
 *
 * 押した印は**まず端末に溜めます**（`client-v4/offlineQueue.ts`）。
 * 列は**鍵で上書き**なので、同じ機材を2回読んでも記録は1つです。
 * 送れていない件数は**常に画面に出します** — 「送ったつもりで送れていない」のが
 * 現場でいちばん困るためです。
 *
 * ── 画面をそのままにしない ────────────────────────────────
 *
 * 溜めた印は**すぐ画面に反映します**（送れるのを待たない）。
 * 待つと「押したのに変わらない」ので、同じものを何度も読むことになります。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import {
  ArrowLeft, Camera, CameraOff, Check, CloudOff, Keyboard, Loader2, PackageSearch, X,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { extractCode } from '@/lib/qrCode';
import { useScanQueue, type CheckDetailData, type ScanMessage } from './useScanQueue';

const SCAN_REGION_ID = 'inv-scan-region';

type Chip = 'rest' | 'done' | 'missing';

export function MobileScanSession({ checkId, onBack }: { checkId: string; onBack: () => void }) {
  const [chip, setChip] = useState<Chip>('rest');
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState<ScanMessage | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const detailQuery = useQuery({
    queryKey: ['inventory-check', checkId],
    queryFn: async () => (await api.get(`/equipment/inventory-checks/${checkId}`)).data.data as CheckDetailData,
  });
  const detail = detailQuery.data;
  const items = useMemo(() => detail?.items ?? [], [detail]);
  /** 終わりにした棚卸し。**確認を記録させない**（PC の画面と同じ判断） */
  const closed = detail?.status === 'completed';
  // 溜めて送るところは `useScanQueue`（画面の見た目と混ぜない）
  const { pending, flush, mark } = useScanQueue(checkId, closed, setMessage);

  /**
   * 読んだ（打った）文字から、この棚卸しの中の1件を探す。
   *
   * **カメラと手打ちで形の見方を変えます。**
   * カメラはゴミを拾うので `extractCode` の形に合わないものは捨てますが、
   * **手打ちは人が打った文字**なので捨てません — 機材IDの付け方は拠点ごとに
   * 増えることがあり、形だけで弾くと**台帳にある ID を打っても
   * 「読み取れない形」と言われます**（検証データの `EQ-0001` で実際に起きました）。
   * 手打ちは**この棚卸しの一覧に当ててから**、無いときだけ「ありません」と言います。
   */
  const resolve = useCallback((raw: string, from: 'camera' | 'manual') => {
    const parsed = extractCode(raw);
    const text = raw.trim();
    if (!parsed && from === 'camera') {
      setMessage({ tone: 'ng', text: `読み取れない形でした: "${text.slice(0, 30)}"` });
      return;
    }
    const wanted = parsed?.value ?? text;
    const hit = items.find((i) => (parsed?.type === 'id'
      ? i.equipment_id === wanted
      : (i.eq_code ?? '').toUpperCase() === wanted.toUpperCase() || i.equipment_id === wanted));
    if (!hit) {
      // **この棚卸しに入っていない機材**。読めてはいるので、そう書き分ける
      setMessage({ tone: 'ng', text: `${wanted.slice(0, 30)} はこの棚卸しの一覧にありません` });
      return;
    }
    mark(hit, 1);
    setMessage({ tone: 'ok', text: `${hit.eq_code} ${hit.equipment_name} を確認しました` });
  }, [items, mark]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
      await scannerRef.current.stop().catch(() => {});
    }
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    setMessage(null);
    try {
      const scanner = new Html5Qrcode(SCAN_REGION_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          // **カメラは止めない。** 現場では続けて何本も読むので、
          // 1件ごとに止めると押し直しが件数ぶん増える
          resolve(decoded, 'camera');
        },
        () => { /* 読めなかったコマは無視 */ },
      );
      setCameraOn(true);
    } catch (err) {
      setMessage({ tone: 'ng', text: `カメラを使えませんでした: ${err instanceof Error ? err.message : String(err)}` });
      setCameraOn(false);
    }
  };

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  if (detailQuery.isError) {
    return (
      <div className="p-3">
        <ErrorPanel title="棚卸しを読み込めませんでした" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      </div>
    );
  }
  if (!detail) return <div className="p-3"><Delayed><SkeletonRows rows={6} /></Delayed></div>;

  // **`found` は 0/1/2**（未確認 / 確認できた / 見つからない）。真偽値ではない。
  // PC の ✓ ✕ と同じ値を書く（片方だけ別の数字にすると集計が食い違う）
  const done = items.filter((i) => i.found === 1);
  const missing = items.filter((i) => i.found === 2);
  const rest = items.filter((i) => i.found === 0);
  const shown = chip === 'done' ? done : chip === 'missing' ? missing : rest;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Button variant="ghost" onClick={onBack} className="self-start">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />中断する
      </Button>

      <PageHeader
        title={detail.title}
        sub={closed
          ? `${detail.check_date} ・ 終わった棚卸しです（読むだけ）`
          : `${detail.check_date} ・ QR を読むと「確認できた」になります`}
        primaryAction={
          closed ? undefined : cameraOn ? (
            <Button className="w-full sm:w-auto" variant="outline" onClick={stopCamera}>
              <CameraOff className="mr-1.5 h-4 w-4" aria-hidden="true" />カメラを止める
            </Button>
          ) : (
            <Button className="w-full sm:w-auto" onClick={startCamera}>
              <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />QR を読む
            </Button>
          )
        }
      />

      {/* 確認できた ・ 見つからない ・ のこり（モックの3つ） */}
      <div className="grid grid-cols-3 gap-2">
        <Count label="確認できた" n={done.length} tone="ok" />
        <Count label="見つからない" n={missing.length} tone={missing.length > 0 ? 'ng' : 'plain'} />
        <Count label="未確認" n={rest.length} tone="plain" />
      </div>

      {/* 終わった棚卸しは**読むだけ**。理由と直し方を出す（PC 側と同じ判断） */}
      {closed && (
        <p className="rounded-note border border-border bg-muted px-3.5 py-3 text-note text-secondary-foreground">
          <strong className="font-bold">この棚卸しは終わっています。</strong>
          確認の記録はできません。直すときは PC の棚卸し画面で「再開する」を押してください。
        </p>
      )}

      {/* **送れていないことを黙らない。** 0 のときは出さない（読む物を増やさない） */}
      {pending > 0 && (
        <p className="rounded-note flex items-start gap-2 border border-warning-border bg-warning-surface px-3.5 py-3 text-note text-secondary-foreground">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-bold">まだ送れていない記録が {pending} 件あります。</strong>
            端末に溜めてあるので、電波が戻ると自動で送ります。
            <strong className="font-bold">送り終わるまでこの画面を閉じても大丈夫です</strong>
            （次に開いたときに送ります）。
          </span>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => flush()}>いま送る</Button>
        </p>
      )}

      <div id={SCAN_REGION_ID} className={cn('overflow-hidden rounded-card', !cameraOn && 'hidden')} />

      {message && (
        <p className={cn(
          'rounded-note border px-3.5 py-2.5 text-sub',
          message.tone === 'ok'
            ? 'border-success-border bg-success-surface text-success'
            : 'border-destructive-border bg-destructive-surface text-destructive',
        )}>
          {message.text}
        </p>
      )}

      {!closed && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setManualOpen((v) => !v)}>
            <Keyboard className="mr-1.5 h-4 w-4" aria-hidden="true" />手で入れる
          </Button>
        </div>
      )}

      {manualOpen && (
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { resolve(manual, 'manual'); setManual(''); } }}
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="機材ID（例 Y-C-00001）"
            aria-label="機材ID"
            autoFocus
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" disabled={!manual.trim()}>確認する</Button>
        </form>
      )}

      <FilterChips
        label="絞り込み"
        items={[
          { key: 'rest', label: '未確認', count: rest.length },
          { key: 'done', label: '確認できた', count: done.length },
          { key: 'missing', label: '見つからない', count: missing.length },
        ]}
        value={chip}
        onChange={(v) => setChip(v as Chip)}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-6 w-6" aria-hidden="true" />}
          title={chip === 'rest' ? '未確認はありません' : chip === 'done' ? 'まだ1つも確認していません' : '見つからないものはありません'}
          description={chip === 'rest' ? '「完了する」は PC の棚卸し画面から行います。' : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((i) => (
            <li key={i.id} className="rounded-card flex items-center gap-2 border border-border bg-card p-3">
              <span className="min-w-0 flex-1">
                <span className="text-list block [overflow-wrap:anywhere]">
                  {i.equipment_name}{i.unit_number ? ` #${i.unit_number}` : ''}
                </span>
                <span className="text-note mt-0.5 block truncate text-muted-foreground">
                  {[i.eq_code, i.location_name || i.location_detail].filter(Boolean).join(' ・ ')}
                </span>
              </span>
              <Button
                variant={i.found === 1 ? 'default' : 'outline'}
                size="icon"
                aria-label="確認できた"
                disabled={closed}
                onClick={() => mark(i, 1)}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant={i.found === 2 ? 'destructive' : 'outline'}
                size="icon"
                aria-label="見つからない"
                disabled={closed}
                onClick={() => mark(i, 2)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">この画面でできるのは棚卸しの記録だけです。</strong>
        貸出は相手・用途・期日を決める作業で、
        <strong className="font-bold">2回押すと2本できてしまう</strong>ので端末に溜められません
        （PC の「貸出・返却」から行います）。
        棚卸しを完了するのも PC からです。
      </p>

      {detailQuery.isFetching && (
        <p className="text-note flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />読み直しています
        </p>
      )}
    </div>
  );
}

function Count({ label, n, tone }: { label: string; n: number; tone: 'ok' | 'ng' | 'plain' }) {
  return (
    <div className={cn(
      'rounded-card border px-2 py-2.5 text-center',
      tone === 'ok' ? 'border-success-border bg-success-surface'
        : tone === 'ng' ? 'border-destructive-border bg-destructive-surface'
        : 'border-border bg-card',
    )}>
      <div className={cn(
        'font-number text-h2',
        tone === 'ok' ? 'text-success' : tone === 'ng' ? 'text-destructive' : '',
      )}>{n}</div>
      <div className="text-note text-muted-foreground">{label}</div>
    </div>
  );
}
