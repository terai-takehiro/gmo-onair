// 計時・視聴者（liveops）— 組織の鍵設定「接続テスト用の鍵（個人）」節。
// `LiveOrgSettingsPage.tsx` から役割で切り出した（`npm run lint` の400行基準対応）。
// `client-live/src/pages/SettingsPage.tsx` の同節の移植。
// 値は保存ボタンが1本の親（`LiveOrgSettingsPage.tsx`）に持たせているため、この
// コンポーネントは controlled（value/onChange を props で受け取る）。
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiTestRow, ApiGuide } from './ApiKeyTestControls';

interface Settings {
  hasYoutubeKey?: boolean;
  hasOwnYoutubeKey?: boolean;
  youtubeApiKeyMasked?: string;
  hasJstreamToken?: boolean;
  hasOwnJstreamToken?: boolean;
  jstreamTokenMasked?: string;
}

export default function PersonalTestKeysSection({ settings, youtubeApiKey, setYoutubeApiKey, jstreamToken, setJstreamToken }: {
  settings: Settings | undefined;
  youtubeApiKey: string;
  setYoutubeApiKey: (v: string) => void;
  jstreamToken: string;
  setJstreamToken: (v: string) => void;
}) {
  const showYt = useToggle();
  const showJs = useToggle();

  return (
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
            type={showYt.on ? 'text' : 'password'}
            value={youtubeApiKey}
            onChange={e => setYoutubeApiKey(e.target.value)}
            placeholder={settings?.hasYoutubeKey ? '****' + (settings?.youtubeApiKeyMasked?.slice(-4) || '') : '未設定'}
            className="flex-1"
          />
          <Button variant="ghost" size="sm" onClick={showYt.toggle}>
            {showYt.on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
            type={showJs.on ? 'text' : 'password'}
            value={jstreamToken}
            onChange={e => setJstreamToken(e.target.value)}
            placeholder={settings?.hasJstreamToken ? '****' + (settings?.jstreamTokenMasked?.slice(-4) || '') : '未設定'}
            className="flex-1"
          />
          <Button variant="ghost" size="sm" onClick={showJs.toggle}>
            {showJs.on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
  );
}

// 表示/非表示トグルの小さいヘルパー（この節専用。2箇所で同じ形を使うため）
function useToggle() {
  const [on, setOn] = useState(false);
  return { on, toggle: () => setOn(v => !v) };
}
