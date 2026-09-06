// テロップCG — ④設定（`/techops/graphics/:ownerKey/settings`）。
//
// **2026-09-06 のゼロベース再設計（docs/design/v4/graphics-redesign.md §5 ④）で新設。**
// 旧実装で3階層に分かれていた設定系（ハブ→部品ライブラリ→テンプレート管理→演出SE／
// 外部連携）と、ハブに同居していた出力URL・テーマ・自動退出ルールを、**1画面・4タブ**
// （出力URL／見た目／同時に出せないもの／連携）にまとめた。中身の部品
// （`OutputUrlCard`・`ThemePicker`・`SlotExitRulesEditor`・`RankingSoundsContent`・
// `InteractiveLinkContent`）は**一切変えていない**——置き場所だけを移した。
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRightLeft, ChevronLeft, Loader2, Type } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@gmo-onair/shared/src/client/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import type { GraphicsBundle } from '@/lib/graphicsApi';
import { useGraphicsProject } from './useGraphicsProject';
import OutputUrlCard from './OutputUrlCard';
import ThemePicker from './ThemePicker';
import SlotExitRulesEditor from './SlotExitRulesEditor';
import { RankingSoundsContent } from './RankingSoundsPanel';
import { InteractiveLinkContent } from './InteractiveLinkSettingsPanel';

const TABS = ['output', 'look', 'rules', 'link'] as const;
type TabKey = (typeof TABS)[number];

function isTabKey(v: string | null): v is TabKey {
  return !!v && (TABS as readonly string[]).includes(v);
}

export default function GraphicsSettingsPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state, reload } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (state.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Type />} title="見つかりませんでした" description="GLS番号が合っているか確かめてください。" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </div>
    );
  }

  return (
    <SettingsContent
      ownerKey={ownerKey ?? ''}
      owner={state.owner}
      bundle={state.bundle}
      reload={reload}
    />
  );
}

function SettingsContent({ ownerKey, owner, bundle, reload }: {
  ownerKey: string;
  owner: OwnerContext;
  bundle: GraphicsBundle;
  reload: () => Promise<void>;
}) {
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === 'system_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = isTabKey(searchParams.get('tab')) ? (searchParams.get('tab') as TabKey) : 'output';
  const [tab, setTab] = useState<TabKey>(initialTab);

  const changeTab = (next: string) => {
    setTab(next as TabKey);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    }, { replace: true });
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={`/techops/graphics/${encodeURIComponent(ownerKey)}`}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        テロップ一覧
      </Link>

      <div className="min-w-0">
        <h1 className="text-h1">設定</h1>
        <p className="mt-1 text-sub text-muted-foreground">
          <span className="font-bold text-foreground">{owner.name}</span> ・ この番組のテロップCGの決めごと。テロップの中身はここでは触りません。
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="output">出力URL</TabsTrigger>
          <TabsTrigger value="look">見た目</TabsTrigger>
          <TabsTrigger value="rules">同時に出せないもの</TabsTrigger>
          <TabsTrigger value="link">連携</TabsTrigger>
        </TabsList>

        <TabsContent value="output" className="mt-4">
          <OutputUrlCard projectId={bundle.project.id} />
        </TabsContent>

        <TabsContent value="look" className="mt-4">
          <section className="rounded-card border border-border bg-card p-4">
            <h2 className="text-cardtitle">見た目（テーマ）</h2>
            <p className="mt-1 text-note text-muted-foreground">色・書体・罫はテーマがまとめて持ちます。テロップごとに色は選びません。</p>
            <div className="mt-3">
              <ThemePicker projectId={bundle.project.id} theme={bundle.project.theme} onSaved={reload} />
            </div>
          </section>
          <p className="mt-3 text-note text-muted-foreground">
            テンプレート（部品の初期値・公開フィールド）の管理は
            {' '}
            <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/templates`} className="font-bold text-primary hover:underline">
              テンプレート管理（上級者向け）
            </Link>
            {' '}から。
          </p>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <SlotExitRulesEditor projectId={bundle.project.id} rules={bundle.project.slotExitRules} onSaved={reload} />
        </TabsContent>

        <TabsContent value="link" className="mt-4 flex flex-col gap-4">
          <section className="rounded-card border border-border bg-card p-4">
            <h2 className="text-cardtitle">視聴者投票（インタラクティブ）</h2>
            <div className="mt-3">
              <InteractiveLinkContent ownerKey={ownerKey} owner={owner} projectId={bundle.project.id} embedded />
            </div>
          </section>
          <section className="rounded-card border border-border bg-card p-4">
            <h2 className="text-cardtitle">効果音（ランキング発表）</h2>
            <div className="mt-3">
              <RankingSoundsContent ownerKey={ownerKey} owner={owner} projectId={bundle.project.id} embedded />
            </div>
          </section>
          {isSystemAdmin && (
            <section className="rounded-card border border-border bg-card p-4">
              <h2 className="text-cardtitle">旧リアルタイムCGから移す</h2>
              <p className="mt-1 text-note text-muted-foreground">
                過去のアワード（awards）の実績を、この仕組みのランキング発表へ変換します。旧データは読むだけで書き換えません。
              </p>
              <Link
                to="/techops/graphics/awards-migration"
                className="mt-3 inline-flex min-h-tap items-center gap-1.5 rounded-control-md border border-border bg-card px-3 text-sub font-bold hover:bg-surface-subtle"
              >
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />移行ツールを開く
              </Link>
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
