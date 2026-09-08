// 収録設定・配信設定への「簡易入口」。
//
// ⚠️ 2026-08-22 廃止: サーバー配信・ルート・サイドバーの入口をすべて外した。コードだけ残す。
// CLAUDE.md の「廃止」の定義（コードは消さずリポジトリに残すが、配信・ビルド対象・
// 画面上の入口をすべて外し、Webサイトのどこからも到達できなくする）と同じ扱い。
// `App.tsx` から `<Route path="/techops/device-settings">` を削除し、`nav.ts`
// （サイドバー・スマホタブ）もこの画面へのリンクを持たない。理由: サイドバーが
// いまの案件/番組の文脈から収録設定・配信設定へ直接リンクするようになった
// （`nav.ts` の `buildQsheetNav`）ため、GLS番号・案件IDを手入力して遠回りする
// この入口が不要になった。復活させたいときは上の2か所を元に戻すだけでよい
// （画面・API はどれも変えていないので、これだけで今日と同じ動作に戻る）。
//
// 以下は廃止前（簡易入口として使われていた当時）の実装コメント:
//
// ⚠️ 2026-08-22 作り直し: これまでは GLS番号/案件IDと実施日を手入力させ、
// 「収録設定を開く」「配信設定を開く」の2ボタンで `/techops/recording|streaming/:ownerKey?date=...`
// へ直接飛ばしていた。これはこのアプリの正規のジャーニー（番組・案件を選ぶ → ハブ画面
// [JourneyPage.tsx] → ミニアプリタイルで収録設定/配信設定を開く）を経由しない抜け道になっており、
// 「サイドバーの導線がジャーニーUXと矛盾している」という指摘の直接の原因だった。加えて
// 「実施日」を利用者に手入力させる設計も、ハブのミニアプリタイルが日付なしで直接開く
// （最新の service_date を自動解決する）挙動と食い違い、余計な入力を強いていた。
//
// 直した方針: 入力を「案件（GLS番号 または 案件ID）」の1つだけにし、送信したら
// `getOwnerContext` で解決してハブ画面（/techops/projects/:id または /techops/programs/:id）へ
// 遷移するだけにした。収録/配信のどちらを開くか・どの日を開くかは、遷移した先のハブの
// ミニアプリタイルで選ぶ（収録設定・配信設定のタイルは日付を問わず「最新の実施日」を
// 自動で開く挙動に統一されているため、ここで日付を訊く必要が無い）。
// GLS番号・案件ID・番組IDを口頭で聞いた人向けの入口、という位置づけ自体は変えていない
// （通常はハブ画面から `panelPathOf` で直接飛ぶので、この画面は経由しない）。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getOwnerContext } from '@/lib/deviceSettingsApi';
import { notifyError } from '@/lib/notify';

export default function DeviceSettingsHome() {
  const navigate = useNavigate();
  const [ownerKey, setOwnerKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const openHub = async () => {
    const key = ownerKey.trim();
    if (!key) return;
    setIsLoading(true);
    try {
      const ctx = await getOwnerContext(key);
      if (!ctx) {
        notifyError('見つかりませんでした。管理番号または案件IDを確認してください');
        return;
      }
      navigate(ctx.kind === 'project' ? `/techops/projects/${ctx.id}` : `/techops/programs/${ctx.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-1 text-lg font-bold">収録・配信設定</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        案件（管理番号 または 案件ID）を入れると、ミニアプリのタイルから収録設定・配信設定を選べる
        ハブ画面を開きます。
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="owner-key">案件（管理番号 または 案件ID）</Label>
          <Input
            id="owner-key"
            className="h-11"
            value={ownerKey}
            onChange={(e) => setOwnerKey(e.target.value)}
            placeholder="GLS-A012"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void openHub();
            }}
          />
        </div>
      </div>

      <div className="mt-6">
        <Button className="h-[52px] w-full" onClick={() => void openHub()} disabled={!ownerKey.trim() || isLoading}>
          <Search className="mr-2 h-4 w-4" /> ハブを開く
        </Button>
      </div>
    </div>
  );
}
