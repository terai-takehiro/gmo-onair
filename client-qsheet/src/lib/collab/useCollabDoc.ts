// Qシート 同時共同編集 (Phase 2.2b + Phase 3) — クライアント Provider フック
//
// Y.Doc を生成し、既存 /qsheet Socket 上で state 同期 (yjs:sync/state/update) と
// awareness (ライブカーソル/選択、awareness:update) を送受信する。
// ローカル編集は mutate() の中で ydocOps を呼び、その Y 更新をサーバーへ送る。
//
// 初期状態はサーバーが JSONB から種を作り yjs:state で返す (client は seed しない)。

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { getQsheetSocket, disconnectQsheetSocket } from '@/lib/socket';
import { yDocToData } from '@gmo-onair/shared/src/collab/yjsDoc';
import { userColor } from './colors';

const LOCAL_ORIGIN = 'local';
const REMOTE_AWARENESS = 'remote-awareness';
const HEARTBEAT_MS = 10_000;

function toU8(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export interface CollabUser {
  id: string;
  name: string;
}
export interface CollabCursor {
  rowId: string;
  blockId: string;
}
export interface CollabPeer {
  clientId: number;
  user: { id: string; name: string; color: string };
  cursor: CollabCursor | null;
}

export interface CollabDoc {
  ydoc: Y.Doc | null;
  synced: boolean;
  data: any | null;
  mutate: (fn: (ydoc: Y.Doc) => void) => void;
  /** 他ユーザーのカーソル/選択 (自分は除く)。 */
  peers: CollabPeer[];
  /** 自分の編集中セルを共有する (null で解除)。 */
  setCursor: (cursor: CollabCursor | null) => void;
}

export function useCollabDoc(
  docId: string | undefined,
  enabled: boolean,
  user?: CollabUser | null,
): CollabDoc {
  const ydocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const [synced, setSynced] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);

  const userId = user?.id;
  const userName = user?.name;

  useEffect(() => {
    if (!enabled || !docId) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const awareness = new Awareness(ydoc);
    awarenessRef.current = awareness;
    if (userId) {
      awareness.setLocalStateField('user', { id: userId, name: userName || '匿名', color: userColor(userId) });
    }
    const socket = getQsheetSocket(docId);

    const snapshot = () => setData(yDocToData(ydoc));

    // Y.Doc 更新: ローカル由来ならサーバーへ、いずれも snapshot 更新
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      snapshot();
      if (origin === LOCAL_ORIGIN) socket.emit('yjs:update', update);
    };
    ydoc.on('update', onDocUpdate);

    const onState = (state: ArrayBuffer) => {
      Y.applyUpdate(ydoc, toU8(state), 'remote');
      setSynced(true);
      snapshot();
    };
    const onRemote = (update: ArrayBuffer) => Y.applyUpdate(ydoc, toU8(update), 'remote');
    socket.on('yjs:state', onState);
    socket.on('yjs:update', onRemote);

    // ── awareness (ライブカーソル/選択) ──
    const recomputePeers = () => {
      const out: CollabPeer[] = [];
      awareness.getStates().forEach((state: any, clientId: number) => {
        if (clientId === awareness.clientID) return;
        if (!state?.user) return;
        out.push({ clientId, user: state.user, cursor: state.cursor ?? null });
      });
      setPeers(out);
    };
    const onAwarenessChange = () => recomputePeers();
    awareness.on('change', onAwarenessChange);

    const onAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === REMOTE_AWARENESS) return; // リモート適用分は再送しない
      const changed = added.concat(updated, removed);
      socket.emit('awareness:update', encodeAwarenessUpdate(awareness, changed));
    };
    awareness.on('update', onAwarenessUpdate);

    const onRemoteAwareness = (update: ArrayBuffer) =>
      applyAwarenessUpdate(awareness, toU8(update), REMOTE_AWARENESS);
    socket.on('awareness:update', onRemoteAwareness);

    const requestSync = () => {
      socket.emit('yjs:sync');
      // 自分の awareness を再送 (後から入った参加者にも見えるように)
      socket.emit('awareness:update', encodeAwarenessUpdate(awareness, [awareness.clientID]));
    };
    socket.on('connect', requestSync);
    if (socket.connected) requestSync();

    // ハートビート: 自分の状態を定期再送 (peer の可視性維持 + タイムアウト回避)
    const heartbeat = setInterval(() => {
      if (socket.connected) socket.emit('awareness:update', encodeAwarenessUpdate(awareness, [awareness.clientID]));
    }, HEARTBEAT_MS);

    recomputePeers();

    return () => {
      clearInterval(heartbeat);
      ydoc.off('update', onDocUpdate);
      awareness.off('change', onAwarenessChange);
      awareness.off('update', onAwarenessUpdate);
      socket.off('yjs:state', onState);
      socket.off('yjs:update', onRemote);
      socket.off('awareness:update', onRemoteAwareness);
      socket.off('connect', requestSync);
      // 退出を peer に通知してから破棄
      removeAwarenessStates(awareness, [awareness.clientID], 'local-cleanup');
      awareness.destroy();
      awarenessRef.current = null;
      disconnectQsheetSocket();
      ydoc.destroy();
      ydocRef.current = null;
      setSynced(false);
      setData(null);
      setPeers([]);
    };
  }, [docId, enabled, userId, userName]);

  const mutate = useCallback((fn: (ydoc: Y.Doc) => void) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    ydoc.transact(() => fn(ydoc), LOCAL_ORIGIN);
  }, []);

  const setCursor = useCallback((cursor: CollabCursor | null) => {
    awarenessRef.current?.setLocalStateField('cursor', cursor);
  }, []);

  return { ydoc: ydocRef.current, synced, data, mutate, peers, setCursor };
}
