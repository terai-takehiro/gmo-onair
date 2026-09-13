// 選択中ページの紙面（blocks）をローカルに持ち、打つ/動かすのを止めて1.5秒で
// サーバーへ自動保存する（production-manual.md §6②「保存は打つのを止めて1.5秒」）。
// 新しい変更が来るたびにデバウンスをリセットする。ページを切り替えるときは
// `flush()` を先に呼んで、切替前の未保存分を即座に送ってから離れる。
import { useCallback, useEffect, useRef, useState } from "react";
import * as manualApi from "@/lib/manualApi";
import { isConflict, isLockError } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";
import type { ManualBlock, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";

const SAVE_DEBOUNCE_MS = 1500;

interface Pending {
  manualId: string;
  pageId: string;
  next: ManualBlock[];
}

export interface UseManualPageAutosaveResult {
  blocks: ManualBlock[];
  /** ManualCanvas の onCommit にそのまま渡す */
  commitBlocks: (next: ManualBlock[]) => void;
  saving: boolean;
  /** ページを切り替える直前に呼ぶ（未保存分があれば即座に送る） */
  flush: () => void;
  /**
   * 紙面（blocks）以外の経路でそのページの updated_at が進んだとき（並べ替え等。
   * `commitMetadata` を通さない書き込みがあれば）に呼ぶ。呼ばないと、次の紙面編集の
   * 自動保存が古い revision を使って送られ、サーバーの楽観ロックに偽の衝突と
   * 判定される（レビュー指摘）。
   */
  syncPageRevision: (pageId: string, updatedAt: string) => void;
  /**
   * ページの題・章名を保存する（`PageRail` の行内編集）。対象が「いま紙面に開いている
   * ページ」と同じときは、紙面の自動保存（保留中/進行中）が終わるのを待ってから送る
   * ——別経路の独立した PUT のまま同時に送ると、どちらかが偽の衝突として弾かれ、
   * 紙面側の未保存分を失いうる（外部レビュー再指摘・P1）。別のページが対象のときは
   * 競合する自動保存が無いのでそのまま送る。
   */
  commitMetadata: (pageId: string, manualId: string, patch: { title?: string; chapter?: string | null }) => Promise<ManualPage>;
  /**
   * いま紙面に開いているページの保留中/進行中の自動保存があれば、それを終わらせて
   * から返る（無ければ即座に返る）。並べ替え（`reorderPages`）のように**冊子内の
   * 全ページの `updated_at` を進める別経路の書き込み**を送る直前に呼ぶ——呼ばずに
   * 送ると、いま開いているページの自動保存が古い revision のまま同時に飛び、
   * 偽の衝突として弾かれて紙面側の未保存分を失いうる（外部レビュー再指摘・P1。
   * `commitMetadata` と同じ理由・同じ仕組み）。
   */
  waitForCurrentPageSave: () => Promise<void>;
}

/**
 * @param page 紙面を表示中のページ（未選択なら undefined）
 * @param onSaved 保存が成功するたびに、サーバーが返した最新行を渡す（呼び出し側はキャッシュを差し替える）
 * @param onConflict 楽観ロック衝突（409）のとき（呼び出し側は再取得する）
 */
export function useManualPageAutosave(
  page: ManualPage | undefined,
  onSaved: (row: ManualPage) => void,
  onConflict: () => void,
): UseManualPageAutosaveResult {
  const [blocks, setBlocks] = useState<ManualBlock[]>(page?.blocks ?? []);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ⚠️⚠️ 外部レビュー再指摘（P1）: 以前は単一スロット（`Pending | null`）だった。
  // A保存中→B編集（pendingRef=B）→（Aがまだ終わらないうちに）C編集、という切替では
  // `runSave`（Cのタイマー発火 or 切替時のflush）が `savingRef.current` を見て
  // 何もしないため pendingRef=B は残るが、直後の C の commitBlocks が
  // `pendingRef.current = {C}` と単純代入するため **B の分がそのまま消える**
  // （一度もサーバーへ送られないまま失われる）。ページ id をキーにした Map にし、
  // 複数ページ分の「まだ送っていない最新の編集」を同時に保持できるようにする。
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  // ⚠️ レビュー指摘（P1）: 以前は単一の ref（コミット時点の page.updated_at）を
  // expected_updated_at として使っていた。①コミット時点で固定すると、送信中に
  // 応答が届いて updated_at が進んでも次の送信がそれを知らないまま古い値を使う
  // （1つ目の指摘）。②単一 ref のまま「送信直前に読む」形にしただけでは、ページA→B
  // へ切り替えた直後にAへの保存応答が遅れて届くと、Bの ref をAの値で上書きしてしまう
  // （2つ目の指摘）。どちらも、ページごとに別々の「いま確実に正しい updated_at」を
  // 持ち（Map）、送信直前にその該当ページの値だけを読む形にすれば両方防げる。
  const revisionsRef = useRef<Map<string, string | undefined>>(new Map());
  const savingRef = useRef(false);
  // 進行中の保存の Promise（常に fulfill——内部で catch 済みなので reject しない）。
  // アンマウント時に「進行中の保存を待ってから最後の1回を送る」ため（レビュー指摘）
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onConflictRef = useRef(onConflict);
  onSavedRef.current = onSaved;
  onConflictRef.current = onConflict;
  // `commitMetadata` が「いま紙面に開いているページと同じか」を判定するための参照
  // （レンダーのたびに最新化。effect を待たず常に最新の page?.id を見る）
  const currentPageIdRef = useRef<string | undefined>(page?.id);
  currentPageIdRef.current = page?.id;

  // ページ切替・楽観ロック衝突からの再取得のときだけローカルを同期する。
  // 自分自身の自動保存の成功では page.updated_at が変わっても resync しない
  // （呼び出し側が setQueryData で同じ内容を積むだけなので resync しても実害は無いが、
  // ManualCanvas 側の undo 履歴を不要に揺らさないため id だけを見る）。
  useEffect(() => {
    setBlocks(page?.blocks ?? []);
    if (page) revisionsRef.current.set(page.id, page.updated_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);

  const syncPageRevision = useCallback((pageId: string, updatedAt: string) => {
    revisionsRef.current.set(pageId, updatedAt);
  }, []);

  const runSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 送信中に新しい編集が来てタイマーが再セットされ、通信より先に発火した場合は
    // ここで引き返す（pendingRef は消さずに残す）。いま進行中の保存が finally で
    // 拾って続けて送る——2本を同時に送って両方に古い expected_updated_at を
    // 持たせない（送信の直列化）。
    if (savingRef.current) return;
    // 待っている中から1件取り出す（挿入順＝古い方から。Mapは挿入順を保つ）
    const nextEntry = pendingRef.current.entries().next();
    if (nextEntry.done) return;
    const [pendingPageId, pending] = nextEntry.value;
    pendingRef.current.delete(pendingPageId);
    savingRef.current = true;
    if (mountedRef.current) setSaving(true);
    savingPromiseRef.current = manualApi
      .updatePage(pending.manualId, pending.pageId, {
        blocks: pending.next,
        expected_updated_at: revisionsRef.current.get(pending.pageId),
      })
      .then((row) => {
        revisionsRef.current.set(pending.pageId, row.updated_at);
        if (mountedRef.current) onSavedRef.current(row);
      })
      .catch((err: unknown) => {
        if (isLockError(err)) {
          notifyError("編集ロックが他の人に移っているか、確定されました。", { description: "最新の内容を読み込み直します。" });
          if (mountedRef.current) onConflictRef.current();
          return;
        }
        if (isConflict(err)) {
          notifyError("ほかの人が先に保存していました。", { description: "最新の内容を読み込み直します。" });
          if (mountedRef.current) onConflictRef.current();
          return;
        }
        notifyError("紙面を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      })
      .finally(() => {
        savingRef.current = false;
        savingPromiseRef.current = null;
        if (mountedRef.current) setSaving(false);
        // 送信中に積まれた新しい編集（他ページ分もありうる）があれば続けて送る
        // （1件ずつ直列に処理——同時に複数を送って個々の expected_updated_at を
        // 混乱させない）
        if (pendingRef.current.size > 0) runSave();
      });
  }, []);

  const commitBlocks = useCallback(
    (next: ManualBlock[]) => {
      setBlocks(next);
      if (!page) return;
      pendingRef.current.set(page.id, { manualId: page.manual_id, pageId: page.id, next });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runSave, SAVE_DEBOUNCE_MS);
    },
    [page, runSave],
  );

  // いま紙面に開いているページの保留中/進行中の保存を終わらせてから返る
  // （`commitMetadata`・`waitForCurrentPageSave` 共通の中身）。保留中の紙面編集が
  // あれば即座に送信を始め、進行中の保存（連鎖しているぶんも含めて）がすべて
  // 終わるまで待つ。
  const flushAndWait = useCallback(async () => {
    runSave();
    while (savingRef.current) {
      await savingPromiseRef.current?.catch(() => {});
    }
  }, [runSave]);

  const commitMetadata = useCallback(
    async (pageId: string, manualId: string, patch: { title?: string; chapter?: string | null }): Promise<ManualPage> => {
      // 対象がいま紙面に開いているページと同じときだけ待つ——これをしないと、
      // このメタデータ PUT が紙面の自動保存と同時に飛び、どちらかが偽の衝突
      // （409）として弾かれてしまう（外部レビュー再指摘）。別のページが対象の
      // ときは競合する自動保存が無いのでそのまま送る。
      if (pageId === currentPageIdRef.current) await flushAndWait();
      const row = await manualApi.updatePage(manualId, pageId, {
        ...patch,
        expected_updated_at: revisionsRef.current.get(pageId),
      });
      revisionsRef.current.set(pageId, row.updated_at);
      return row;
    },
    [flushAndWait],
  );

  const waitForCurrentPageSave = useCallback(async () => {
    if (currentPageIdRef.current) await flushAndWait();
  }, [flushAndWait]);

  // アンマウント時: タイマーは止め、未送信分があれば best-effort で1回だけ送る
  // （結果を state に反映する相手がもう居ないので、成功/失敗のハンドリングはしない）。
  // ⚠️ レビュー指摘（P1）: 保存が進行中のときに即座に送ると、進行中の保存とこの送信が
  // 同時に飛び、どちらも同じ古い revision を掴んだまま——アトミックな guard のもとでは
  // 後発（この送信）が409になり中身が失われる（catchが握りつぶす）か、進行中の方が
  // 後着になってこちらを無音上書きしてしまう。進行中の保存（`savingPromiseRef`）が
  // あれば、それが finally で revision を更新し終えるのを待ってから送る。
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      // Map化に伴い、複数ページぶんの未送信が残っていることがある——全件を
      // best-effort で送る（各ページの行は互いに独立しており、同時に送っても
      // 競合しない。同じページが2件並ぶことは無い——Mapはページidで一意）
      const pendingEntries = Array.from(pendingRef.current.values());
      pendingRef.current.clear();
      if (pendingEntries.length === 0) return;
      const sendFinal = () => {
        for (const pending of pendingEntries) {
          manualApi
            .updatePage(pending.manualId, pending.pageId, {
              blocks: pending.next,
              expected_updated_at: revisionsRef.current.get(pending.pageId),
            })
            .catch(() => {});
        }
      };
      const inFlight = savingPromiseRef.current;
      if (inFlight) inFlight.then(sendFinal, sendFinal);
      else sendFinal();
    },
    [],
  );

  return { blocks, commitBlocks, saving, flush: runSave, syncPageRevision, commitMetadata, waitForCurrentPageSave };
}
