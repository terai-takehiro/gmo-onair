import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, CheckCircle, Download, Upload, ShieldOff, PlugZap, Loader2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import OrgKeysSection from './OrgKeysSection';

type TestPlatform = 'youtube' | 'jstream' | 'zoom' | 'teams';
interface TestResult { status: 'ok' | 'error' | 'unconfigured' | 'untested'; message: string; latencyMs: number; detail?: string }

/** API 接続テストボタン + 結果表示 */
function ApiTestRow({ platform, note }: { platform: TestPlatform; note?: string }) {
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
function ApiGuide({ title, steps }: { title: string; steps: React.ReactNode[] }) {
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

export default function SettingsPage() {
  const { canManage } = usePermissions();
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [jstreamToken, setJstreamToken] = useState('');
  const [pollingInterval, setPollingInterval] = useState('10');
  const [showYt, setShowYt] = useState(false);
  const [showJs, setShowJs] = useState(false);
  const [saved, setSaved] = useState(false);

  // Zoom fields
  const [zoomAccountId, setZoomAccountId] = useState('');
  const [zoomClientId, setZoomClientId] = useState('');
  const [zoomClientSecret, setZoomClientSecret] = useState('');
  const [showZoomSecret, setShowZoomSecret] = useState(false);

  // Teams fields
  const [teamsTenantId, setTeamsTenantId] = useState('');
  const [teamsClientId, setTeamsClientId] = useState('');
  const [teamsClientSecret, setTeamsClientSecret] = useState('');
  const [showTeamsSecret, setShowTeamsSecret] = useState(false);

  const { data: settings, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/liveops/settings').then(r => r.data.data),
  });

  useEffect(() => {
    if (settings) setPollingInterval(String(settings.pollingIntervalSec));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/liveops/settings', {
      youtubeApiKey: youtubeApiKey || undefined,
      jstreamToken: jstreamToken || undefined,
      pollingIntervalSec: parseInt(pollingInterval, 10),
      zoomAccountId: zoomAccountId || undefined,
      zoomClientId: zoomClientId || undefined,
      zoomClientSecret: zoomClientSecret || undefined,
      teamsTenantId: teamsTenantId || undefined,
      teamsClientId: teamsClientId || undefined,
      teamsClientSecret: teamsClientSecret || undefined,
    }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setYoutubeApiKey('');
      setJstreamToken('');
      setZoomAccountId(''); setZoomClientId(''); setZoomClientSecret('');
      setTeamsTenantId(''); setTeamsClientId(''); setTeamsClientSecret('');
      refetch();
    },
  });

  const handleExport = async () => {
    const [progs, setts] = await Promise.all([
      api.get('/liveops/programs').then(r => r.data.data),
      api.get('/liveops/settings').then(r => r.data.data),
    ]);
    const blob = new Blob([JSON.stringify({ programs: progs, settings: setts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liveops-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.programs) {
        for (const p of data.programs) {
          await api.post('/liveops/programs', {
            name: p.name, youtubeUrls: p.youtube_urls, jstreamLpid: p.jstream_lpid,
          }).catch(() => {});
        }
      }
      alert('インポートが完了しました');
    };
    input.click();
  };

  if (!canManage) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b bg-card px-4 py-2">
          <h1 className="text-sm font-bold">設定</h1>
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground gap-2">
          <ShieldOff className="h-5 w-5" />
          <span className="text-sm">設定の変更は管理者権限が必要です</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold">設定</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* 組織共通の鍵（サーバー側の計測が使う） */}
          <OrgKeysSection />

          {/* API Keys（接続テスト専用。計測はここではなく上の組織共通の鍵を使う） */}
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">接続テスト用の鍵（個人）</h2>
            <p className="text-xs text-muted-foreground">
              ここに入れた鍵は<strong>接続テストにだけ</strong>使われます（サーバー側の計測には使われません）。
              APIキーはサーバーでAES-256-GCM暗号化して保存されます。入力した値は画面を離れると消去されます。
            </p>

            <div className="space-y-1.5">
              <Label>YouTube Data API v3 キー</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showYt ? 'text' : 'password'}
                  value={youtubeApiKey}
                  onChange={e => setYoutubeApiKey(e.target.value)}
                  placeholder={settings?.hasYoutubeKey ? '****' + (settings?.youtubeApiKeyMasked?.slice(-4) || '') : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowYt(!showYt)}>
                  {showYt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {settings?.hasOwnYoutubeKey && (
                <p className="text-xs text-green-600">設定済み ({settings.youtubeApiKeyMasked})</p>
              )}
              {!settings?.hasOwnYoutubeKey && settings?.hasYoutubeKey && (
                <p className="text-xs text-amber-600">他ユーザーのキーで接続テストを共有利用中 (自分のキーを設定すると優先されます。計測には使われません)</p>
              )}
              <ApiGuide
                title="YouTube APIキーの取得方法"
                steps={[
                  <>Google Cloud Console でプロジェクトを作成し「YouTube Data API v3」を有効化</>,
                  <>「認証情報」→「APIキーを作成」でキーを発行 (キー制限で YouTube Data API v3 のみに絞ると安全)</>,
                  <>発行されたキーを上の欄に貼り付けて保存</>,
                ]}
              />
              <ApiTestRow platform="youtube" note="保存済みのキーで YouTube API を実際に呼び出して検証します" />
            </div>

            <div className="space-y-1.5">
              <Label>Jstream トークン</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showJs ? 'text' : 'password'}
                  value={jstreamToken}
                  onChange={e => setJstreamToken(e.target.value)}
                  placeholder={settings?.hasJstreamToken ? '****' + (settings?.jstreamTokenMasked?.slice(-4) || '') : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowJs(!showJs)}>
                  {showJs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {settings?.hasOwnJstreamToken && (
                <p className="text-xs text-green-600">設定済み ({settings.jstreamTokenMasked})</p>
              )}
              {!settings?.hasOwnJstreamToken && settings?.hasJstreamToken && (
                <p className="text-xs text-amber-600">他ユーザーのトークンで接続テストを共有利用中 (自分のトークンを設定すると優先されます。計測には使われません)</p>
              )}
              <ApiGuide
                title="Jstream トークンの取得方法"
                steps={[
                  <>J-Stream Equipmedia の管理画面で API トークンを発行 (契約担当者経由)</>,
                  <>トークンを上の欄に貼り付けて保存。番組設定でライブの LPID を登録すると取得が始まります</>,
                ]}
              />
              <ApiTestRow platform="jstream" note="番組設定に登録済みの LPID を使って疎通確認します" />
            </div>
          </section>

          {/* Zoom */}
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Zoom API 設定</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Server-to-Server OAuth アプリの認証情報を入力してください。Zoom Business+ プランが必要です（Metrics API 利用条件）。
              </p>
            </div>
            {settings?.hasOwnZoomCredentials && (
              <p className="text-xs text-green-600">設定済み</p>
            )}
            {!settings?.hasOwnZoomCredentials && settings?.hasZoomCredentials && (
              <p className="text-xs text-amber-600">他ユーザーの資格情報で接続テストを共有利用中（計測には使われません）</p>
            )}
            <div className="space-y-1.5">
              <Label>Account ID</Label>
              <Input
                type="text"
                value={zoomAccountId}
                onChange={e => setZoomAccountId(e.target.value)}
                placeholder={settings?.hasZoomCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input
                type="text"
                value={zoomClientId}
                onChange={e => setZoomClientId(e.target.value)}
                placeholder={settings?.hasZoomCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showZoomSecret ? 'text' : 'password'}
                  value={zoomClientSecret}
                  onChange={e => setZoomClientSecret(e.target.value)}
                  placeholder={settings?.hasZoomCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowZoomSecret(!showZoomSecret)}>
                  {showZoomSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <ApiGuide
              title="Zoom 資格情報の取得方法"
              steps={[
                <>Zoom App Marketplace →「Develop」→「Build App」→「Server-to-Server OAuth」でアプリを作成</>,
                <>Scopes に <code className="rounded bg-muted px-1">dashboard_meetings:read:admin</code> / <code className="rounded bg-muted px-1">dashboard_webinars:read:admin</code> を追加</>,
                <>App Credentials の Account ID / Client ID / Client Secret を上の欄に入力して保存</>,
              ]}
            />
            <ApiTestRow platform="zoom" note="Zoom の OAuth 認証を実際に行い資格情報を検証します" />
          </section>

          {/* Teams */}
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Microsoft Teams API 設定</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Azure AD でアプリ登録し、OnlineMeetings.Read.All アプリケーション権限が必要です。
              </p>
            </div>
            {settings?.hasOwnTeamsCredentials && (
              <p className="text-xs text-green-600">設定済み</p>
            )}
            {!settings?.hasOwnTeamsCredentials && settings?.hasTeamsCredentials && (
              <p className="text-xs text-amber-600">他ユーザーの資格情報で接続テストを共有利用中（計測には使われません）</p>
            )}
            <div className="space-y-1.5">
              <Label>Tenant ID</Label>
              <Input
                type="text"
                value={teamsTenantId}
                onChange={e => setTeamsTenantId(e.target.value)}
                placeholder={settings?.hasTeamsCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input
                type="text"
                value={teamsClientId}
                onChange={e => setTeamsClientId(e.target.value)}
                placeholder={settings?.hasTeamsCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showTeamsSecret ? 'text' : 'password'}
                  value={teamsClientSecret}
                  onChange={e => setTeamsClientSecret(e.target.value)}
                  placeholder={settings?.hasTeamsCredentials ? '設定済み（変更する場合のみ入力）' : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowTeamsSecret(!showTeamsSecret)}>
                  {showTeamsSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <ApiGuide
              title="Teams 資格情報の取得方法"
              steps={[
                <>Azure Portal →「アプリの登録」で新規アプリを登録 (Tenant ID / Client ID が発行される)</>,
                <>「証明書とシークレット」でクライアントシークレットを作成</>,
                <>「APIのアクセス許可」で Microsoft Graph の <code className="rounded bg-muted px-1">OnlineMeetings.Read.All</code> (アプリケーション) を追加し管理者の同意を付与</>,
              ]}
            />
            <ApiTestRow platform="teams" note="Microsoft Graph の認証を実際に行い資格情報を検証します" />
          </section>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saved ? <><CheckCircle className="h-4 w-4 mr-2" />保存しました</> : '設定を保存'}
          </Button>

          {/* Export / Import */}
          <section className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">設定の書き出し・読み込み</h2>
            <p className="text-xs text-muted-foreground">
              番組プリセットをJSONファイルとして保存・復元できます。（APIキーは含まれません）
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />エクスポート
              </Button>
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Upload className="h-4 w-4 mr-1" />インポート
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
