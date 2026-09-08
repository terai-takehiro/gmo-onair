// 計時・視聴者（liveops）— 組織の鍵設定「Zoom API 設定」節。
// `LiveOrgSettingsPage.tsx` から役割で切り出した（`npm run lint` の400行基準対応）。
// `client-live/src/pages/SettingsPage.tsx` の同節の移植。
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiTestRow, ApiGuide } from './ApiKeyTestControls';

export default function ZoomSettingsSection({
  hasCredentials, hasOwnCredentials,
  accountId, setAccountId, clientId, setClientId, clientSecret, setClientSecret,
}: {
  hasCredentials: boolean | undefined;
  hasOwnCredentials: boolean | undefined;
  accountId: string; setAccountId: (v: string) => void;
  clientId: string; setClientId: (v: string) => void;
  clientSecret: string; setClientSecret: (v: string) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <section className="rounded-card border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-cardtitle">Zoom API 設定</h2>
        <p className="text-note text-muted-foreground mt-1">
          Server-to-Server OAuth アプリの認証情報を入力してください。Zoom Business+ プランが必要です（Metrics API 利用条件）。
        </p>
      </div>
      {hasOwnCredentials && (
        <p className="text-sub-sm text-green-600">設定済み</p>
      )}
      {!hasOwnCredentials && hasCredentials && (
        <p className="text-note text-amber-600">他ユーザーの資格情報で接続テストを共有利用中（計測には使われません）</p>
      )}
      <div className="space-y-1.5">
        <Label>Account ID</Label>
        <Input
          type="text"
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
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
        title="Zoom 資格情報の取得方法"
        steps={[
          <>Zoom App Marketplace →「Develop」→「Build App」→「Server-to-Server OAuth」でアプリを作成</>,
          <>Scopes に <code className="rounded-badge-xs bg-muted px-1">dashboard_meetings:read:admin</code> / <code className="rounded-badge-xs bg-muted px-1">dashboard_webinars:read:admin</code> を追加</>,
          <>App Credentials の Account ID / Client ID / Client Secret を上の欄に入力して保存</>,
        ]}
      />
      <ApiTestRow platform="zoom" note="Zoom の OAuth 認証を実際に行い資格情報を検証します" />
    </section>
  );
}
