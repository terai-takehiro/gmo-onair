// 案件 (GLS-B) の共同編集 — 永続化と読み書き (要件 B1 / B2)
//
// ルームマネージャ本体は shared/collab/roomManager.ts (Qシートと共有)。
// ここは案件固有の永続化と、共同編集を使わない経路 (HTTP / MCP / AI) 向けの入口だけ。
//
// 真実の所在:
//   Yjs の state が正。JSONB (doc) は**読み取り用のスナップショット**で、
//   persist のたびに一緒に更新する。JSONB を持たないと、共同編集中に
//   JSONB を読む経路が古いままになる (v2.9.169 で Qシートが踏んだ話)。

import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { YjsRoomManager, type RoomPersistence } from '../../../shared/collab/roomManager';
import {
  docToUpdate,
  updateToDoc,
  emptyProjectCollabDoc,
  type ProjectCollabDoc,
} from '../../../shared/collab/projectCollabDoc';

function parseDoc(raw: unknown): ProjectCollabDoc {
  const base = emptyProjectCollabDoc();
  if (!raw) return base;
  const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<ProjectCollabDoc>;
  return {
    notes: typeof o?.notes === 'string' ? o.notes : '',
    checklist: Array.isArray(o?.checklist) ? o.checklist : [],
  };
}

const persistence: RoomPersistence = {
  async loadState(projectId) {
    const row = await queryOne('SELECT state FROM project_collab WHERE project_id = $1', [projectId]);
    const state = row?.state as Buffer | undefined | null;
    return state ? new Uint8Array(state) : null;
  },

  async loadSeed(projectId) {
    // 案件が実在することだけ確認する。行が無ければ空の doc から種化する
    // (「まだ誰もメモを書いていない案件」が普通なので、行の不在は正常)
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (!proj) return null;
    const row = await queryOne('SELECT doc FROM project_collab WHERE project_id = $1', [projectId]);
    return docToUpdate(parseDoc(row?.doc));
  },

  async persist(projectId, state) {
    // JSONB スナップショットを同時に更新する。ここが落ちても Y state は保存されるので
    // 業務は続く。ただしスナップショットが古いままになるので必ずログに出す。
    let docJson = '{"notes":"","checklist":[]}';
    try {
      docJson = JSON.stringify(updateToDoc(state));
    } catch (e) {
      console.error('[project-collab] snapshot 変換に失敗 (state のみ保存):', (e as Error).message);
    }
    await execute(
      `INSERT INTO project_collab (project_id, doc, state, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (project_id) DO UPDATE
         SET doc = EXCLUDED.doc, state = EXCLUDED.state, updated_at = NOW()`,
      [projectId, docJson, Buffer.from(state)]
    );
  },
};

export const projectCollabRooms = new YjsRoomManager(persistence, 3000, 'project-collab');

export const projectCollabService = {
  /** 案件が実在するか (socket のアクセス判定と HTTP で共用) */
  async projectExists(projectId: string): Promise<boolean> {
    const row = await queryOne(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    return !!row;
  },

  /**
   * 読み取り。
   * 部屋が開いていれば**メモリ上の Y state から作った最新**を返す
   * (debounce 中の JSONB はまだ古いことがあるため)。
   */
  async getDoc(projectId: string): Promise<ProjectCollabDoc & { live: boolean }> {
    if (!(await this.projectExists(projectId))) {
      throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    }
    const state = projectCollabRooms.getState(projectId);
    if (state) {
      try {
        return { ...updateToDoc(state), live: true };
      } catch (e) {
        console.error('[project-collab] live state の変換に失敗、JSONB に落とします:', (e as Error).message);
      }
    }
    const row = await queryOne('SELECT doc FROM project_collab WHERE project_id = $1', [projectId]);
    return { ...parseDoc(row?.doc), live: false };
  },

  /**
   * 共同編集を使わない全置換の書き込み (MCP / スクリプト / 初期投入向け)。
   *
   * **部屋が開いているときは拒否する。** 開いている間に JSONB と state を丸ごと
   * 差し替えると、いま画面で打っている人の編集を黙って消す。
   * 「後勝ち上書きをやめる」のがこの機能の目的なので、ここで上書きしては本末転倒。
   * 編集中の案件に AI が書き込む経路 (要件 B5) は、部屋に対する追記として
   * 別途用意する (下記 TODO)。
   */
  async putDoc(projectId: string, doc: ProjectCollabDoc, userId: string): Promise<ProjectCollabDoc> {
    if (!(await this.projectExists(projectId))) {
      throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    }
    if (projectCollabRooms.isOpen(projectId)) {
      throw new AppError(
        409,
        'COLLAB_IN_PROGRESS',
        'この案件は今だれかが編集中です。編集中の内容を消さないため、この方法では保存できません'
      );
    }
    const normalized: ProjectCollabDoc = {
      notes: typeof doc?.notes === 'string' ? doc.notes : '',
      checklist: (Array.isArray(doc?.checklist) ? doc.checklist : []).map((it, i) => ({
        id: it?.id || `chk_${Date.now()}_${i}`,
        text: typeof it?.text === 'string' ? it.text : '',
        done: !!it?.done,
        assigned_to: it?.assigned_to ?? null,
        due_at: it?.due_at ?? null,
      })),
    };
    // state も作り直す。JSONB だけ更新すると、次に部屋を開いたとき
    // 古い state が優先されて (loadState が先) 書き込みが無かったことになる。
    const state = docToUpdate(normalized);
    await execute(
      `INSERT INTO project_collab (project_id, doc, state, updated_at, updated_by)
       VALUES ($1, $2::jsonb, $3, NOW(), $4)
       ON CONFLICT (project_id) DO UPDATE
         SET doc = EXCLUDED.doc, state = EXCLUDED.state,
             updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [projectId, JSON.stringify(normalized), Buffer.from(state), userId]
    );
    return normalized;
  },
};

// TODO(要件 B5): 編集中の案件に AI が追記する経路。
// 部屋が開いている場合は Y.Text の末尾に insert して他の参加者へ中継する必要があり、
// socket 層と結線しないと成立しない。ここは Phase 6 (B5 案件エージェント) で作る。
// それまで AI からの書き込みは「部屋が閉じているときだけ putDoc」で足りる。
