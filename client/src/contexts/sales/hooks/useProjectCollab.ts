/**
 * useProjectCollab — 案件の同時編集 (在席 + 内容同期 + いま触っている欄)
 *
 * サーバー側の土台は v2.9.249 で作った共通ファクトリ (`/project-collab`)。
 * ここはその**クライアント側**で、1 本の socket で 3 つを扱う:
 *   ① 在席 (presence:sync) — 誰が同じ案件を開いているか
 *   ② 内容同期 (yjs:*)     — **作業メモとチェックリストだけ**
 *   ③ いま触っている欄 (awareness:update) — 案件の中身フォームの衝突を事前に見せる
 *
 * ── 何を同時編集の対象にしないか ──────────────────────────
 *
 * **金額は対象外**。監査の対象なので「誰がいくらに変えたか」を1本の線で辿れる必要があり、
 * 「両方の編集を残す」Yjs とは目的が逆。金額は v2.9.267 の 409 で保存を止める方式のまま。
 *
 * **案件名などフォームの欄も内容は同期しない**。あれは `projects` の列で、
 * フォームの PUT・MCP・決算インポートが直接書いている。Yjs を重ねると
 * 同じ列への書き手が2系統になり、調停を誤れば消える (タスクを外したのと同じ理由)。
 * 代わりに③で「誰がどの欄を触っているか」だけを見せる — 全項目まとめて保存する
 * フォームでは、これが分かるだけで衝突のほとんどが避けられる。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import {
  yDocToDoc,
  emptyProjectCollabDoc,
  type ProjectCollabDoc,
} from "@gmo-onair/shared/src/collab/projectCollabDoc";
import type { PresenceUser } from "@gmo-onair/shared/src/client/collab/PresenceAvatars";

const LOCAL_ORIGIN = "local";
const REMOTE_AWARENESS = "remote-awareness";
const HEARTBEAT_MS = 10_000;
/** これを過ぎても同期が来なければ「同時編集に繋がっていない」と画面に出す */
const SYNC_TIMEOUT_MS = 8_000;

function toU8(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function readSocketAuth(): { token?: string; userId?: string } {
  try {
    const token = localStorage.getItem("gmo_onair_token");
    const rawUser = localStorage.getItem("gmo_onair_user");
    const userId = rawUser ? (JSON.parse(rawUser)?.id as string | undefined) : undefined;
    const auth: { token?: string; userId?: string } = {};
    if (token && token !== "undefined" && token !== "null") auth.token = token;
    if (userId) auth.userId = userId;
    return auth;
  } catch {
    return {};
  }
}

/** 他の人がいま触っている欄 */
export interface FieldPeer {
  userId: string;
  name: string;
  field: string;
}

export interface ProjectCollab {
  /** 同じ案件を開いている人 (自分を含む) */
  presence: PresenceUser[];
  /** Yjs の初期同期が済んだか。false のうちはメモを編集させない */
  synced: boolean;
  /** 繋がらなかった (権限なし / socket 不通)。画面に理由を出すため */
  failed: boolean;
  doc: ProjectCollabDoc;
  /** Y.Doc をローカル編集する (増分がサーバーへ飛ぶ) */
  mutate: (fn: (ydoc: Y.Doc) => void) => void;
  /** 他の人がいま触っている欄 */
  fieldPeers: FieldPeer[];
  /** 自分がいま触っている欄を共有する (null で解除) */
  setField: (field: string | null) => void;
}

export function useProjectCollab(
  projectId: string | undefined,
  user: { id: string; name: string } | null | undefined,
  /** 編集できるか。false なら socket を張らず、読み取りは HTTP に任せる */
  canEdit: boolean,
): ProjectCollab {
  const ydocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [synced, setSynced] = useState(false);
  const [failed, setFailed] = useState(false);
  const [doc, setDoc] = useState<ProjectCollabDoc>(emptyProjectCollabDoc);
  const [fieldPeers, setFieldPeers] = useState<FieldPeer[]>([]);

  const userId = user?.id;
  const userName = user?.name;

  useEffect(() => {
    if (!projectId || !canEdit) return;
    setSynced(false);
    setFailed(false);

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const awareness = new Awareness(ydoc);
    awarenessRef.current = awareness;
    if (userId) {
      awareness.setLocalStateField("user", { id: userId, name: userName || "匿名" });
    }

    let socket: Socket;
    try {
      socket = io("/project-collab", {
        path: "/socket.io/",
        query: { projectId },
        auth: readSocketAuth(),
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });
    } catch {
      // socket が張れない環境でも案件画面は使えなければならない
      setFailed(true);
      awareness.destroy();
      awarenessRef.current = null;
      ydoc.destroy();
      ydocRef.current = null;
      return;
    }

    const snapshot = () => setDoc(yDocToDoc(ydoc));

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      snapshot();
      if (origin === LOCAL_ORIGIN) socket.emit("yjs:update", update);
    };
    ydoc.on("update", onDocUpdate);

    const onState = (state: ArrayBuffer) => {
      Y.applyUpdate(ydoc, toU8(state), "remote");
      setSynced(true);
      setFailed(false);
      snapshot();
    };
    const onRemote = (update: ArrayBuffer) => Y.applyUpdate(ydoc, toU8(update), "remote");
    socket.on("yjs:state", onState);
    socket.on("yjs:update", onRemote);

    const onPresence = (payload: { users?: PresenceUser[] }) => {
      setPresence(Array.isArray(payload?.users) ? payload.users : []);
    };
    socket.on("presence:sync", onPresence);

    // ── いま触っている欄 (awareness) ──
    const recompute = () => {
      const out: FieldPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const s = state as { user?: { id?: string; name?: string }; field?: string | null };
        if (!s?.user?.id || !s.field) return;
        // 同じ人が複数タブで同じ欄 → 1件にまとめる
        if (out.some((p) => p.userId === s.user!.id && p.field === s.field)) return;
        out.push({ userId: s.user.id, name: s.user.name || "匿名", field: s.field });
      });
      setFieldPeers(out);
    };
    awareness.on("change", recompute);

    const onAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === REMOTE_AWARENESS) return; // リモート適用分は送り返さない
      socket.emit("awareness:update", encodeAwarenessUpdate(awareness, added.concat(updated, removed)));
    };
    awareness.on("update", onAwarenessUpdate);
    const onRemoteAwareness = (update: ArrayBuffer) =>
      applyAwarenessUpdate(awareness, toU8(update), REMOTE_AWARENESS);
    socket.on("awareness:update", onRemoteAwareness);

    const requestSync = () => {
      socket.emit("yjs:sync");
      socket.emit("presence:query");
      socket.emit("awareness:update", encodeAwarenessUpdate(awareness, [awareness.clientID]));
    };
    socket.on("connect", requestSync);
    if (socket.connected) requestSync();

    // 自分の在席を保つ (peer のタイムアウト回避)
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit("awareness:update", encodeAwarenessUpdate(awareness, [awareness.clientID]));
      }
    }, HEARTBEAT_MS);

    // 同期が来ないまま黙って編集させると「書いたのに保存されていない」になる
    const timeout = setTimeout(() => {
      setSynced((s) => {
        if (!s) setFailed(true);
        return s;
      });
    }, SYNC_TIMEOUT_MS);

    return () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      ydoc.off("update", onDocUpdate);
      awareness.off("change", recompute);
      awareness.off("update", onAwarenessUpdate);
      socket.off("yjs:state", onState);
      socket.off("yjs:update", onRemote);
      socket.off("presence:sync", onPresence);
      socket.off("awareness:update", onRemoteAwareness);
      socket.off("connect", requestSync);
      removeAwarenessStates(awareness, [awareness.clientID], "local-cleanup");
      awareness.destroy();
      awarenessRef.current = null;
      socket.disconnect();
      ydoc.destroy();
      ydocRef.current = null;
      setPresence([]);
      setSynced(false);
      setDoc(emptyProjectCollabDoc());
      setFieldPeers([]);
    };
  }, [projectId, canEdit, userId, userName]);

  const mutate = useCallback((fn: (ydoc: Y.Doc) => void) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    ydoc.transact(() => fn(ydoc), LOCAL_ORIGIN);
  }, []);

  const setField = useCallback((field: string | null) => {
    awarenessRef.current?.setLocalStateField("field", field);
  }, []);

  return { presence, synced, failed, doc, mutate, fieldPeers, setField };
}
