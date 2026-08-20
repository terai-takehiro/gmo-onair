/**
 * ⑥ QRスキャン — カメラ制御と読み取り解決（PC・スマホ共通）
 *
 * **カメラの制御 (html5-qrcode) は1行も変えていません**（`ScanPage.tsx` の元コメントのまま）。
 * ここは「見た目の作り直し」で PC/スマホの2つの見え方に分けるにあたり、
 * どちらも同じ1つのカメラ制御・同じ1つの解決ロジックを使うための置き場所です。
 * **画面ごとにこのフックを呼び直さないこと** — カメラのインスタンスが2つでき、
 * 片方が読んでももう片方の状態は変わりません（`ScanPage.tsx` で1回だけ呼びます）。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { extractCode } from '@/lib/qrCode';

export const SCAN_REGION_ID = 'qr-scan-region';

export function useScanner() {
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

  const submitManual = () => {
    if (manualCode.trim()) resolveAndNavigate(manualCode.trim());
  };

  return {
    error, manualCode, setManualCode, cameraOn, searching,
    startCamera, stopCamera, submitManual,
  };
}

export type ScannerState = ReturnType<typeof useScanner>;
