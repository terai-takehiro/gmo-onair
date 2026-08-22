// 計時・視聴者（liveops）— 組織の鍵設定が使う共通の小部品（接続テストボタン・取得方法ガイド）。
// `LiveOrgSettingsPage.tsx` から役割で切り出した（`npm run lint` の400行基準対応）。
// `client-live/src/pages/SettingsPage.tsx` の同名コンポーネントの移植。
import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckCircle, PlugZap, Loader2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';

export type TestPlatform = 'youtube' | 'jstream' | 'zoom' | 'teams';
export interface TestResult { status: 'ok' | 'error' | 'unconfigured' | 'untested'; message: string; latencyMs: number; detail?: string }

/** API 接続テストボタン + 結果表示（個人の接続テスト用の鍵 — `/liveops/settings/test/:platform`） */
export function ApiTestRow({ platform, note }: { platform: TestPlatform; note?: string }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const run = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await api.post(`/liveops/settings/test/${platform}`);
      setResult(r.data.data as TestResult);
    } catch (e: any) {
      setResult({ status: 'error', message: e?.response?.data?.message || e.message, latencyMs: 0 });
    } finally {
      setTesting(false);
    }
  };

  const icon = result?.status === 'ok' ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
    : result?.status === 'error' ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
    : result ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
    : null;
  const textColor = result?.status === 'ok' ? 'text-green-700 dark:text-green-500'
    : result?.status === 'error' ? 'text-destructive'
    : 'text-amber-600';

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={testing}>
          {testing
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />テスト中…</>
            : <><PlugZap className="h-3.5 w-3.5 mr-1.5" />接続テスト</>}
        </Button>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {result && (
        <div className={`flex items-start gap-1.5 rounded-md border p-2 text-xs ${
          result.status === 'ok' ? 'border-green-600/30 bg-green-600/5'
          : result.status === 'error' ? 'border-destructive/30 bg-destructive/5'
          : 'border-amber-500/30 bg-amber-500/5'
        }`} role="status">
          {icon}
          <div className="min-w-0">
            <p className={`font-medium ${textColor}`}>
              {result.message}
              {result.status === 'ok' && result.latencyMs > 0 && (
                <span className="font-normal text-muted-foreground"> ({result.latencyMs}ms)</span>
              )}
            </p>
            {result.detail && <p className="text-muted-foreground mt-0.5 break-all">{result.detail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** 取得方法などの簡易ガイド (折りたたみ) */
export function ApiGuide({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground select-none">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />{title}
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </details>
  );
}
