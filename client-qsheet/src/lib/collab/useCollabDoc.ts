// Qシート 同時共同編集 (Phase 2.2b) — クライアント Provider フック
//
// Y.Doc を生成し、既存 /qsheet Socket 上で state 同期 (yjs:sync/state) と
// 増分更新 (yjs:update) を送受信する。ローカル編集は mutate() の中で ydocOps を呼び、
// その結果生じる Y 更新をサーバーへ送る。リモート更新は Y.Doc に適用し snapshot を再生成する。
//
// 注意: 初期状態はサーバーが JSONB から種を作って yjs:state で返す (client は seed しない)。
//       → 二重 seed による内容重複を防ぐ。同期完了まで synced=false。

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { getQsheetSocket, disconnectQsheetSocket } from '@/lib/socket';
import { yDocToData } from '@gmo-onair/shared/src/collab/yjsDoc';

const LOCAL_ORIGIN = 'local';

function toU8(buf: ArrayBuffer | Uint8Array | Buffer): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  return new Uint8Array(buf as ArrayBuffer);
}

export interface CollabDoc {
  ydoc: Y.Doc | null;
  synced: boolean;
  /** Y.Doc から導出した DocumentData スナップショット (未同期なら null)。 */
  data: any | null;
  /** ローカル編集を 1 トランザクションで適用する (ydocOps をこの中で呼ぶ)。 */
  mutate: (fn: (ydoc: Y.Doc) => void) => void;
}

export function useCollabDoc(docId: string | undefined, enabled: boolean): CollabDoc {
  const ydocRef = useRef<Y.Doc | null>(null);
  const [synced, setSynced] = useState(false);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    if (!enabled || !docId) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const socket = getQsheetSocket(docId);

    const snapshot = () => setData(yDocToData(ydoc));

    // Y.Doc 更新: ローカル由来ならサーバーへ送信、いずれの場合も snapshot 更新
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
    const onRemote = (update: ArrayBuffer) => {
      Y.applyUpdate(ydoc, toU8(update), 'remote');
    };
    socket.on('yjs:state', onState);
    socket.on('yjs:update', onRemote);

    const requestSync = () => socket.emit('yjs:sync');
    socket.on('connect', requestSync);
    if (socket.connected) requestSync();

    return () => {
      ydoc.off('update', onDocUpdate);
      socket.off('yjs:state', onState);
      socket.off('yjs:update', onRemote);
      socket.off('connect', requestSync);
      disconnectQsheetSocket();
      ydoc.destroy();
      ydocRef.current = null;
      setSynced(false);
      setData(null);
    };
  }, [docId, enabled]);

  const mutate = useCallback((fn: (ydoc: Y.Doc) => void) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    ydoc.transact(() => fn(ydoc), LOCAL_ORIGIN);
  }, []);

  return { ydoc: ydocRef.current, synced, data, mutate };
}
