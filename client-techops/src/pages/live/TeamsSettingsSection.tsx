// 計時・視聴者（liveops）— 組織の鍵設定「Microsoft Teams API 設定」節。
// `LiveOrgSettingsPage.tsx` から役割で切り出した（`npm run lint` の400行基準対応）。
// `client-live/src/pages/SettingsPage.tsx` の同節の移植。
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiTestRow, ApiGuide } from './ApiKeyTestControls';

export default function TeamsSettingsSection({
  hasCredentials, hasOwnCredentials,
  tenantId, setTenantId, clientId, setClientId, clientSecret, setClientSecret,
}: {
  hasCredentials: boolean | undefined;
  hasOwnCredentials: boolean | undefined;
  tenantId: string; setTenantId: (v: string) => void;
  clientId: string; setClientId: (v: string) => void;
  clientSecret: string; setClientSecret: (v: string) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <section className="rounded-card border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-cardtitle">Microsoft Teams API 設定</h2>
        <p className="text-note text-muted-foreground mt-1">
          Azure AD でアプリ登録し、OnlineMeetings.Read.All アプリケーション権限が必要です。
        </p>
      </div>
      {hasOwnCredentials && (
        <p className="text-sub-sm text-green-600">設定済み</p>
      )}
      {!hasOwnCredentials && hasCredentials && (
        <p className="text-note text-amber-600">他ユーザーの資格情報で接続テストを共有利用中（計測には使われません）</p>
      )}
      <div className="space-y-1.5">
        <Label>Tenant ID</Label>
        <Input
          type="text"
          value={tenantId}
          onChange={e => setTenantId(e.target.value)}
          placeholder={hasCredentials ? '設定済み（変更する場合のみ入力）' : '未入力'}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Client ID</Label>
        <Input
          type="text"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          placeholder={hasCredentials ? '設定済み（変更する場合のみ入力）' : '未入力'}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Client Secret</Label>
        <div className="flex items-center gap-2">
          <Input
            type={showSecret ? 'text' : 'password'}
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={hasCredentials ? '設定済み（変更する場合のみ入力）' : '未入力'}
            className="flex-1"
          />
          <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <ApiGuide
        title="Teams 資格情報の取得方法"
        steps={[
          <>Azure Portal →「アプリの登録」で新規アプリを登録 (Tenant ID / Client ID が発行される)</>,
          <>「証明書とシークレット」でクライアントシークレットを作成</>,
          <>「APIのアクセス許可」で Microsoft Graph の <code className="rounded-badge-xs bg-muted px-1">OnlineMeetings.Read.All</code> (アプリケーション) を追加し管理者の同意を付与</>,
        ]}
      />
      <ApiTestRow platform="teams" note="Microsoft Graph の認証を実際に行い資格情報を検証します" />
    </section>
  );
}
