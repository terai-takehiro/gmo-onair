// 計時・視聴者（liveops）— 組織共通の鍵（`client-live/src/pages/OrgKeysSection.tsx` の移植）。
// `LiveOrgSettingsPage.tsx` からだけ呼ばれる。ロジック・見た目は変えていない。
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, PlugZap, Loader2, XCircle, AlertTriangle } from 'lucide-react';

/**
 * サーバー側の計測（実装設計 09 §6）が使う「組織共通の鍵」を1本だけ持たせる画面。
 * ⚠️ 個人の鍵（`LiveOrgSettingsPage.tsx` の「接続テスト用の鍵」節）にはフォールバックしない。
 * 計測はここに入っている鍵だけを見る。
 */
type Platform = 'youtube' | 'jstream' | 'zoom' | 'teams';
interface TestResult { status: 'ok' | 'error' | 'unconfigured'; message: string; latencyMs: number; detail?: string }

function TestButton({ platform }: { platform: Platform }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const run = async () => {
    setTesting(true); setResult(null);
    try {
      const r = await api.post(`/liveops/org-settings/test/${platform}`);
      setResult(r.data.data as TestResult);
    } catch (e: any) {
      setResult({ status: 'error', message: e?.response?.data?.message || e.message, latencyMs: 0 });
    } finally {
      setTesting(false);
    }
  };
  const icon = result?.status === 'ok' ? <CheckCircle className="h-4 w-4 text-green-600" />
    : result?.status === 'error' ? <XCircle className="h-4 w-4 text-destructive" />
    : result ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : null;
  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={testing}>
        {testing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />テスト中…</> : <><PlugZap className="h-3.5 w-3.5 mr-1.5" />接続テスト</>}
      </Button>
      {result && (
        <div className="flex items-start gap-1.5 rounded-md border p-2 text-xs">
          {icon}
          <div className="min-w-0">
            <p>{result.message}</p>
            {result.detail && <p className="text-muted-foreground mt-0.5 break-all">{result.detail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgKeysSection() {
  const { data, refetch } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => api.get('/liveops/org-settings').then(r => r.data.data),
  });
  const { data: quota } = useQuery({
    queryKey: ['measure-quota'],
    queryFn: () => api.get('/liveops/measure/quota').then(r => r.data.data as { used: number; limit: number; warn: boolean }),
    refetchInterval: 60_000,
  });

  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [jstreamToken, setJstreamToken] = useState('');
  const [zoomAccountId, setZoomAccountId] = useState('');
  const [zoomClientId, setZoomClientId] = useState('');
  const [zoomClientSecret, setZoomClientSecret] = useState('');
  const [teamsTenantId, setTeamsTenantId] = useState('');
  const [teamsClientId, setTeamsClientId] = useState('');
  const [teamsClientSecret, setTeamsClientSecret] = useState('');
  const [pollingIntervalSec, setPollingIntervalSec] = useState('10');
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) setPollingIntervalSec(String(data.pollingIntervalSec)); }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/liveops/org-settings', {
      youtubeApiKey: youtubeApiKey || undefined,
      jstreamToken: jstreamToken || undefined,
      zoomAccountId: zoomAccountId || undefined,
      zoomClientId: zoomClientId || undefined,
      zoomClientSecret: zoomClientSecret || undefined,
      teamsTenantId: teamsTenantId || undefined,
      teamsClientId: teamsClientId || undefined,
      teamsClientSecret: teamsClientSecret || undefined,
      pollingIntervalSec: parseInt(pollingIntervalSec, 10),
    }),
    onSuccess: () => {
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      setYoutubeApiKey(''); setJstreamToken('');
      setZoomAccountId(''); setZoomClientId(''); setZoomClientSecret('');
      setTeamsTenantId(''); setTeamsClientId(''); setTeamsClientSecret('');
      refetch();
    },
  });

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">組織共通の鍵（計測用）</h2>
        <p className="text-xs text-muted-foreground mt-1">
          サーバー側の「計測」はここに登録した鍵だけを使います。個人ごとの鍵にはフォールバックしません。
        </p>
      </div>

      {quota && (
        <p className={`text-xs ${quota.warn ? 'text-amber-600' : 'text-muted-foreground'}`}>
          今日の YouTube 消費: {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>YouTube Data API v3 キー</Label>
          <Input type="password" value={youtubeApiKey} onChange={e => setYoutubeApiKey(e.target.value)}
            placeholder={data?.hasYoutubeKey ? `設定済み (${data.youtubeApiKeyMasked})` : '未入力'} />
          <TestButton platform="youtube" />
        </div>
        <div className="space-y-1.5">
          <Label>Jstream トークン</Label>
          <Input type="password" value={jstreamToken} onChange={e => setJstreamToken(e.target.value)}
            placeholder={data?.hasJstreamToken ? `設定済み (${data.jstreamTokenMasked})` : '未入力'} />
          <TestButton platform="jstream" />
        </div>
        <div className="space-y-1.5">
          <Label>Zoom Account ID / Client ID / Secret</Label>
          <Input value={zoomAccountId} onChange={e => setZoomAccountId(e.target.value)} placeholder="Account ID" />
          <Input value={zoomClientId} onChange={e => setZoomClientId(e.target.value)} placeholder="Client ID" />
          <Input type="password" value={zoomClientSecret} onChange={e => setZoomClientSecret(e.target.value)} placeholder="Client Secret" />
          {data?.hasZoomCredentials && <p className="text-xs text-green-600">設定済み</p>}
          <TestButton platform="zoom" />
        </div>
        <div className="space-y-1.5">
          <Label>Teams Tenant ID / Client ID / Secret</Label>
          <Input value={teamsTenantId} onChange={e => setTeamsTenantId(e.target.value)} placeholder="Tenant ID" />
          <Input value={teamsClientId} onChange={e => setTeamsClientId(e.target.value)} placeholder="Client ID" />
          <Input type="password" value={teamsClientSecret} onChange={e => setTeamsClientSecret(e.target.value)} placeholder="Client Secret" />
          {data?.hasTeamsCredentials && <p className="text-xs text-green-600">設定済み</p>}
          <TestButton platform="teams" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="w-32 shrink-0">取得間隔 (秒)</Label>
        <Input type="number" min={5} max={300} value={pollingIntervalSec}
          onChange={e => setPollingIntervalSec(e.target.value)} className="w-24" />
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saved ? <><CheckCircle className="h-4 w-4 mr-2" />保存しました</> : '組織共通の鍵を保存'}
      </Button>
    </section>
  );
}
