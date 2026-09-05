// 計時・視聴者（liveops）— 組織の鍵設定（v4.1 段2・ミニアプリ化フェーズ2・このステージ）。
//
// `client-live/src/pages/SettingsPage.tsx` の移植。落としていない機能:
//   ・組織共通の鍵（`OrgKeysSection.tsx`。計測が使う唯一の鍵。取得間隔も含む）
//   ・接続テスト用の鍵（個人。YouTube/Jstream。`PersonalTestKeysSection.tsx`）
//   ・Zoom API 設定（`ZoomSettingsSection.tsx`）・Teams API 設定（`TeamsSettingsSection.tsx`）
//   ・設定の書き出し・読み込み（`ExportImportSection.tsx`）
// 400行基準（`npm run lint`）に収めるため、節ごとに別ファイルへ切り出した
// （元は1ファイルの構成。ロジック・見た目・保存の単位は変えていない — 保存は
// 今までどおり「接続テスト用の鍵＋Zoom＋Teams」を1本の `PUT /liveops/settings`
// で行い、値は本ファイルに持たせたまま子コンポーネントへ props で渡している）。
//
// ⚠️ 案件に紐づかない（`:ownerKey` を取らない）画面。system_admin/qsheet manager
// 向けの組織全体の設定であり、ダッシュボード画面のヘッダー（歯車アイコン）から
// リンクする。**PC専用画面として扱う**（旧 `client-live` の `pcOnlyScreens.ts`
// `LIVE_PC_ONLY` の理由をそのまま引き継ぐ — YouTube/Jstream/Zoom/Teams の
// API キー・クライアントシークレットを外部サービスの管理画面と往復しながら
// 貼り付ける画面のため）。`src/pcOnlyScreens.ts` の `TECHOPS_PC_ONLY` に登録済み。
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ChevronLeft, CheckCircle, ShieldOff } from 'lucide-react';
import OrgKeysSection from './OrgKeysSection';
import PersonalTestKeysSection from './PersonalTestKeysSection';
import ZoomSettingsSection from './ZoomSettingsSection';
import TeamsSettingsSection from './TeamsSettingsSection';
import ExportImportSection from './ExportImportSection';

export default function LiveOrgSettingsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');

  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [jstreamToken, setJstreamToken] = useState('');
  const [pollingInterval, setPollingInterval] = useState('10');
  const [saved, setSaved] = useState(false);

  // Zoom fields
  const [zoomAccountId, setZoomAccountId] = useState('');
  const [zoomClientId, setZoomClientId] = useState('');
  const [zoomClientSecret, setZoomClientSecret] = useState('');

  // Teams fields
  const [teamsTenantId, setTeamsTenantId] = useState('');
  const [teamsClientId, setTeamsClientId] = useState('');
  const [teamsClientSecret, setTeamsClientSecret] = useState('');

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

  const Header = (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
        aria-label="戻る"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="text-sm font-bold">計時・視聴者 — 組織の鍵設定</h1>
    </div>
  );

  if (!canManage) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="flex flex-1 items-center justify-center text-muted-foreground gap-2">
          <ShieldOff className="h-5 w-5" />
          <span className="text-sm">設定を変えるには 制作技術支援の「管理」が必要です。</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {Header}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* 組織共通の鍵（サーバー側の計測が使う） */}
          <OrgKeysSection />

          {/* API Keys（接続テスト専用。計測はここではなく上の組織共通の鍵を使う） */}
          <PersonalTestKeysSection
            settings={settings}
            youtubeApiKey={youtubeApiKey} setYoutubeApiKey={setYoutubeApiKey}
            jstreamToken={jstreamToken} setJstreamToken={setJstreamToken}
          />

          <ZoomSettingsSection
            hasCredentials={settings?.hasZoomCredentials}
            hasOwnCredentials={settings?.hasOwnZoomCredentials}
            accountId={zoomAccountId} setAccountId={setZoomAccountId}
            clientId={zoomClientId} setClientId={setZoomClientId}
            clientSecret={zoomClientSecret} setClientSecret={setZoomClientSecret}
          />

          <TeamsSettingsSection
            hasCredentials={settings?.hasTeamsCredentials}
            hasOwnCredentials={settings?.hasOwnTeamsCredentials}
            tenantId={teamsTenantId} setTenantId={setTeamsTenantId}
            clientId={teamsClientId} setClientId={setTeamsClientId}
            clientSecret={teamsClientSecret} setClientSecret={setTeamsClientSecret}
          />

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saved ? <><CheckCircle className="h-4 w-4 mr-2" />保存しました</> : '設定を保存'}
          </Button>

          <ExportImportSection />
        </div>
      </div>
    </div>
  );
}
