/**
 * 案件詳細 / 当日タブ (v4 ⑥)
 *
 * 本番当日に開くもの (制作資料) への入口です。
 *
 * ── 凍結アプリとの約束 ──────────────────────────────────────
 *
 * 制作資料 (Qシート) は v4.0.0 では**凍結**で、
 * トップページのアプリ一覧からは外れます。ただし決めごとは
 * **「URL は生かす」**なので、**案件の中からは今日から開けます**。
 * この案件に紐づく資料をサーバーから引いて、あるものだけ並べます
 * (`GET /qsheet/documents?project_id=`)。
 *
 * ⚠️ 技術資料アプリは削除済み（制作資料へのマージに向けてアプリごと削除した）。
 *
 * ── まだ出せないもの ────────────────────────────────────────
 *
 * モックは資料ごとに「準備稿 / 決定稿」のような**進み具合**も出しています。
 * その状態は凍結アプリ側の作りに依存するので、**いまは出しません**。
 * 出せないことを黙っていると「状態が無い資料」に見えるので、
 * 画面に「バージョンアップで対応予定」と書きます。
 *
 * ── スマホは iOS の一覧セル（v4ネイティブUI監査・この回） ──────
 *
 * 着手前は PC も スマホも同じ `Row`（`stackOnMobile`）で、375px でも
 * 「薄い区切り線 + 小さい『開く』リンク」という**表を縮めただけ**の見た目でした。
 * **本番当日はいちばん急いでいるとき**に押すタブなので、行全体を1つの
 * タップ対象にし（`Row` の「開く」だけでは当たり判定が右端 96px に閉じていた）、
 * アイコンを丸背景の中に置いて資料の種類が一目で分かるようにしています。
 * PC は従来の `Row` のままです（中身・API呼び出しは1つも変えていません）。
 */
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ClipboardList, Info, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';

interface Doc { id: string; title: string; status?: string | null; updated_at: string }

/** 凍結アプリは**別のベースパス**なので、React Router ではなく素の遷移で開く */
function DocList({
  title, icon: Icon, docs, hrefOf, emptyHint, mobile,
}: {
  title: string;
  icon: typeof ClipboardList;
  docs: Doc[];
  hrefOf: (d: Doc) => string;
  emptyHint: string;
  mobile: boolean;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
        <span className="text-sub-sm font-number ml-auto text-muted-foreground">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="text-sub px-4 py-4 text-muted-foreground">{emptyHint}</p>
      ) : mobile ? (
        // **行全体が1つのタップ対象。** 現場で急いでいるときに右端の
        // 小さいリンクを狙わせない（`Row` の「開く」は96px幅しかない）
        <div className="flex flex-col">
          {docs.map((d) => (
            <a
              key={d.id}
              href={hrefOf(d)}
              className="flex min-h-tap items-center gap-3 border-b border-border-faint px-4 py-3 last:border-b-0 active:bg-muted"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control-md bg-primary-surface-weak">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate font-bold">{d.title || '名前のない資料'}</span>
                <span className="text-sub-sm block text-muted-foreground">
                  最後の更新 {d.updated_at.slice(0, 10).replace(/-/g, '/')}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        docs.map((d) => (
          <Row key={d.id} divider interactive stackOnMobile>
            <RowMain>
              <RowTitle>{d.title || '名前のない資料'}</RowTitle>
              <RowSub>最後の更新 {d.updated_at.slice(0, 10).replace(/-/g, '/')}</RowSub>
            </RowMain>
            <RowSlot w={96} align="right">
              <a
                href={hrefOf(d)}
                className="text-sub min-h-tap inline-flex items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />開く
              </a>
            </RowSlot>
          </Row>
        ))
      )}
    </section>
  );
}

export function DayTab({ projectId, mobile }: { projectId: string; mobile?: boolean }) {
  const qsheets = useQuery<Doc[]>({
    queryKey: ['project-qsheets', projectId],
    queryFn: async () => (await api.get('/qsheet/documents', { params: { project_id: projectId } })).data.data,
  });

  if (qsheets.isLoading) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={3} /></Delayed></div>;
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <DocList
        title="制作資料（Qシート）"
        icon={ClipboardList}
        docs={qsheets.data ?? []}
        hrefOf={(d) => `/qsheet/editor/${d.id}`}
        emptyHint="この案件の制作資料はまだありません。制作資料の画面から作れます。"
        mobile={!!mobile}
      />

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          制作資料は v4.0.0 では見た目を変えずに残しています（アプリの一覧からは外れますが、
          <strong className="font-bold">ここからは今までどおり開けます</strong>）。
          資料ごとの進み具合（準備稿・決定稿など）をここに出すのは、
          <strong className="font-bold">次のバージョンで対応予定</strong>です。
        </p>
      </div>
    </div>
  );
}
