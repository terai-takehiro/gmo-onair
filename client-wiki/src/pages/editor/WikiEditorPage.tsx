/**
 * ③ 編集 `/wiki/p/:id/edit`（PC・スマホで同じ URL。設計 §6-③・§6-⑨）
 *
 * ── 何で作るか（2026-09-22 の判断）──────────────────────────
 *
 * **素の `<textarea>` を主にし、右にプレビューを並べます。** 設計書が第一候補に
 * 挙げていた見たまま編集（Milkdown）は入れません。理由は `WikiEditorTextarea.tsx` の
 * 冒頭にまとめてあります（手入力を最優先というご指示・本文の正が Markdown の文字列・
 * スマホの日本語入力）。
 *
 * ── この画面が守ること ──────────────────────────────────────
 *
 *  1. **開いた瞬間から打てる**（読み込みの間だけ読み取り専用）
 *  2. **保存の応答で本文を書き戻さない**（日本語の変換とカーソルが壊れる）
 *  3. **打つのを止めて 1.5 秒で保存**し、結果をヘッダーに出す
 *  4. 他の人が編集中なら読むだけにして、「編集を代わってほしい」と申し出られる
 *  5. スマホは下のツールバー5つ（キーボードのすぐ上）だけにする
 *  6. **AI は「整える」と「下書きを作成」の2つ**（段E）。整えた結果は、
 *     人が「置き換える」を押すまで本文に入らない（設計 §6-③）
 *
 * ⚠️ 画面の中に2本目のナビの列や2つ目の `☰` を作らないこと
 *    （`client-wiki/CLAUDE.md`「ナビの列は1本だけ」）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Delayed, ErrorPanel, NoPermissionPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiAutosave } from '@/hooks/useWikiAutosave';
import { useWikiImageInsert } from '@/hooks/useWikiImageInsert';
import { useWikiPageLock } from '@/hooks/useWikiPageLock';
import { useWikiPage, wikiKeys } from '@/lib/wikiApi';
import AiDraftSheet from '@/components/ai/AiDraftSheet';
import AiTidySheet from '@/components/ai/AiTidySheet';
import { useWikiAiEdit } from '@/components/ai/useWikiAiEdit';
import type { WikiDraftResult } from '@/components/ai/aiApi';
import WikiBlockSheet from '@/components/editor/WikiBlockSheet';
import WikiEditorHeader from '@/components/editor/WikiEditorHeader';
import WikiEditorLockBar from '@/components/editor/WikiEditorLockBar';
import WikiEditorMobileBar from '@/components/editor/WikiEditorMobileBar';
import WikiEditorTextarea, {
  type WikiEditorTextareaHandle,
  type WikiSelectionInfo,
} from '@/components/editor/WikiEditorTextarea';
import WikiEditorToolbar from '@/components/editor/WikiEditorToolbar';
import WikiPreviewPane from '@/components/editor/WikiPreviewPane';
import WikiSelectionBar from '@/components/editor/WikiSelectionBar';
import {
  insertLink, insertTable, toggleBold, toggleBullet, toggleCheck, toggleHeading,
  type Edit,
} from '@/components/editor/markdownEdits';
import type { WikiBlockChoice } from '@/components/editor/blockCatalog';

/** プレビューを開いているか。端末の中だけに覚える（読む画面の情報パネルと同じ考え方） */
const PREVIEW_KEY = 'gmo_onair_wiki_preview_open';

function readPreviewOpen(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) !== '0';
  } catch {
    return true;
  }
}

const PLACEHOLDER = 'ここに打っていきます。記号を覚えていなくても、上のツールバーから見出しや箇条書きにできます。';

function WikiEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { canEdit, canManage, permissionsLoading } = usePermissions();

  const pageQ = useWikiPage(id);
  const page = pageQ.data;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [previewOpen, setPreviewOpen] = useState(readPreviewOpen);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [selection, setSelection] = useState<WikiSelectionInfo>({ text: '', point: null });
  const [publishing, setPublishing] = useState(false);
  const editorRef = useRef<WikiEditorTextareaHandle>(null);
  /** 一覧を開く引き金になった `/` の位置（選んだら消す） */
  const slashAtRef = useRef<number | null>(null);
  /** ツリーと一覧に出る値。変わったときだけ問い合わせをやり直す */
  const shownRef = useRef<{ title: string; status: string }>({ title: '', status: '' });

  const lock = useWikiPageLock(id, currentUser?.id, canEdit);
  const autosave = useWikiAutosave(id, {
    enabled: canEdit && lock.held,
    onSaved: (saved) => {
      // 読む画面が持っている中身を差し替える（戻ったときに古い本文を出さない）
      queryClient.setQueryData(wikiKeys.page(saved.id), (old: unknown) => ({
        ...(old as object | undefined ?? {}),
        ...saved,
      }));
      // 題と状態はツリー・ホームにも出る。変わったときだけ取り直す
      if (saved.title !== shownRef.current.title || saved.status !== shownRef.current.status) {
        shownRef.current = { title: saved.title, status: saved.status };
        void queryClient.invalidateQueries({ queryKey: wikiKeys.home() });
        if (saved.space_key) void queryClient.invalidateQueries({ queryKey: wikiKeys.tree(saved.space_key) });
      }
    },
  });

  /** 読み込んだページを1回だけ画面に写す。**そのあとは手元の値が正** */
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!page || loadedRef.current === page.id) return;
    loadedRef.current = page.id;
    setTitle(page.title);
    setBody(page.body_md ?? '');
    shownRef.current = { title: page.title, status: page.status };
    autosave.reset(page);
  }, [page, autosave]);

  // 「戻る」で待たずに出ていけるように、その場で送り切るための控え。
  // 画面から外れるときの送り切りは `useWikiAutosave` の側が行う（二重に送らない）
  const saveNowRef = useRef(autosave.saveNow);
  saveNowRef.current = autosave.saveNow;

  const readOnly = !canEdit || !lock.held;

  const apply = useCallback((edit: Edit) => { editorRef.current?.apply(edit); }, []);
  const images = useWikiImageInsert(id, apply);

  /**
   * AI が下書きを書いたあと（段E）。**サーバーは既に本文を保存しています**。
   * 画面の本文と、次の保存に添える突き合わせの値を置き直さないと、
   * この画面が持っている古い本文で上書きするか、409 で止まります。
   */
  const onDrafted = useCallback((res: WikiDraftResult) => {
    const next = res.page;
    setTitle(next.title);
    setBody(next.body_md ?? '');
    loadedRef.current = next.id;
    autosave.reset(next);
    // 読む画面が持っている中身に重ねる（丸ごと置くと、一覧用の列が落ちることがある）
    queryClient.setQueryData(wikiKeys.page(next.id), (old: unknown) => ({
      ...(old as object | undefined ?? {}),
      ...next,
    }));
    // AI が題を決めたときはツリーとホームにも出る
    if (next.title !== shownRef.current.title) {
      shownRef.current = { title: next.title, status: next.status };
      void queryClient.invalidateQueries({ queryKey: wikiKeys.home() });
      if (next.space_key) void queryClient.invalidateQueries({ queryKey: wikiKeys.tree(next.space_key) });
    }
  }, [autosave, queryClient]);

  const ai = useWikiAiEdit({
    pageId: id,
    status: page?.status ?? 'draft',
    title,
    body,
    editorRef,
    apply,
    onDrafted,
  });

  const onBodyChange = (next: string, opts?: { composing?: boolean }) => {
    setBody(next);
    // 変換の途中は値だけ受け取り、1.5 秒の待ちは進めない（確定してから数える）
    if (opts?.composing) autosave.hold({ title, body: next });
    else autosave.queue({ title, body: next });
  };
  const onTitleChange = (next: string) => {
    setTitle(next);
    autosave.queue({ title: next, body });
  };

  const handleSelection = useCallback((info: WikiSelectionInfo) => setSelection(info), []);
  const handleSlash = useCallback((at: number) => {
    slashAtRef.current = at;
    setBlocksOpen(true);
  }, []);

  const pickBlock = (block: WikiBlockChoice) => {
    setBlocksOpen(false);
    const at = slashAtRef.current;
    slashAtRef.current = null;
    if (at === null) editorRef.current?.apply(block.edit);
    else editorRef.current?.applyAfterSlash(block.edit, at);
  };

  const leave = async () => {
    await saveNowRef.current();
    navigate(`/p/${id}`);
  };

  const publish = async () => {
    setPublishing(true);
    const ok = await autosave.saveNow({ status: 'published' });
    setPublishing(false);
    if (ok) {
      notifySuccess('公開しました', { description: '検索と、AI が答えるときの出典に出るようになります。' });
      void queryClient.invalidateQueries({ queryKey: wikiKeys.page(id) });
    }
  };

  const reload = async () => {
    const ok = await confirmAction({
      title: '最新の本文を読み込み直しますか？',
      description: 'この画面で打った内容は、他の人が保存した本文に置き換わります。残したい文があるときは、先にコピーしてください。',
      confirmLabel: '読み込み直す',
      tone: 'danger',
    });
    if (!ok) return;
    loadedRef.current = null;
    const fresh = await pageQ.refetch();
    if (fresh.data) {
      setTitle(fresh.data.title);
      setBody(fresh.data.body_md ?? '');
      loadedRef.current = fresh.data.id;
      autosave.reset(fresh.data);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_KEY, previewOpen ? '1' : '0');
    } catch {
      // 保存できなくても画面は動く
    }
  }, [previewOpen]);

  if (!permissionsLoading && !canEdit) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-4">
        <NoPermissionPanel modules={['wiki']} level="editor" target="ページの編集" />
      </div>
    );
  }

  if (pageQ.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorPanel
          title="ページを読み込めませんでした"
          error={pageQ.error}
          onRetry={() => void pageQ.refetch()}
        />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="p-4 lg:p-6">
        <Delayed>
          <SkeletonRows rows={8} rowHeight={28} />
        </Delayed>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <WikiEditorHeader
        title={title}
        onTitleChange={onTitleChange}
        status={page.status}
        reviewBy={page.review_by}
        saveState={autosave.state}
        savedAt={autosave.savedAt}
        readOnly={readOnly}
        publishing={publishing}
        onBack={() => void leave()}
        onPublish={() => void publish()}
        onReload={() => void reload()}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((v) => !v)}
      />

      <WikiEditorLockBar lock={lock} canManage={canManage} onLeave={() => void leave()} />

      <WikiEditorToolbar
        disabled={readOnly}
        uploading={images.busy}
        onHeading={() => apply(toggleHeading)}
        onBullet={() => apply(toggleBullet)}
        onCheck={() => apply(toggleCheck)}
        onTable={() => apply(insertTable)}
        onLink={() => apply(insertLink())}
        onPickImages={(files) => void images.insertFiles(files)}
        onOpenBlocks={() => setBlocksOpen(true)}
        onTidy={ai.openTidy}
        onDraft={ai.openDraft}
        canDraft={ai.canDraft}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="relative mx-auto h-full w-full max-w-[860px]">
            <WikiEditorTextarea
              ref={editorRef}
              value={body}
              onChange={onBodyChange}
              readOnly={readOnly}
              onSlash={handleSlash}
              onSelectionChange={handleSelection}
              onFiles={(data) => (readOnly ? false : images.insertFromTransfer(data))}
              placeholder={PLACEHOLDER}
            />
            {/* 文字を選んでいるあいだだけ浮かぶ（太字・リンク） */}
            {!readOnly && selection.text && (
              <WikiSelectionBar
                point={selection.point}
                onBold={() => apply(toggleBold)}
                onLink={() => apply(insertLink())}
              />
            )}
          </div>
        </div>

        {previewOpen && <WikiPreviewPane title={title} body={body} />}
      </div>

      <WikiEditorMobileBar
        disabled={readOnly}
        uploading={images.busy}
        onHeading={() => apply(toggleHeading)}
        onBullet={() => apply(toggleBullet)}
        onCheck={() => apply(toggleCheck)}
        onPickImages={(files) => void images.insertFiles(files)}
        onTidy={ai.openTidy}
      />

      <WikiBlockSheet
        open={blocksOpen}
        onOpenChange={(v) => {
          if (!v) slashAtRef.current = null;
          setBlocksOpen(v);
        }}
        onPick={pickBlock}
      />

      <AiTidySheet {...ai.tidySheet} />
      <AiDraftSheet {...ai.draftSheet} />
    </div>
  );
}

/**
 * **ページが変わったら画面ごと作り直す**（`key`）。
 *
 * `/p/A/edit` から `/p/B/edit` へ移ると、React Router は同じ部品を使い回して
 * `:id` だけを差し替えます。すると自動保存は「まだ送っていない A の本文」を
 * 持ったまま B のページを指すことになり、**A で打った文章が B に書き込まれます**。
 * `key` を id にしておけば、移った瞬間に前の画面が終わり（＝残りを A へ送り切り）、
 * 新しい画面がまっさらな状態で始まります。
 */
export default function WikiEditorPage() {
  const { id } = useParams<{ id: string }>();
  // この道は `/p/:id/edit` にしか当たらないので id は必ずある
  if (!id) return null;
  return <WikiEditor key={id} id={id} />;
}
