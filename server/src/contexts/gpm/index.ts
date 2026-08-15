/**
 * プロジェクト管理（GPM）の API (migration 161)
 *
 * マウントは `/api/v1/internal/gpm/*`。権限モジュールは `gpm`。
 *
 * **`gpm` を `UserListPage` の PERM_MODULES と `auth.routes` の MODULES に
 * 足してから**このルーターを守ること。逆順だと system_admin 以外の全員が 403 になり、
 * 画面から権限を付けることもできなくなる（`apps.ts` は前から `gpm` を宣言していたのに、
 * この2つに入っておらず**誰にも付与できない状態**だった）。
 */
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission, meetsPermissionLevel } from '../../shared/middleware/auth';
import { queryOne, execute } from '../../shared/db/connection';
import { estimateService, withCanApprove } from '../sales/services/estimate.service';
import { gpmEstimateSummary } from './services/gpm-estimate.service';
import { AppError } from '../../shared/middleware/errorHandler';
import {
  templateService, projectService, openItemService, phaseService, memberService, gpmTaskService,
  openItemToAsk,
} from './services/gpm.service';
/**
 * 議事録は**案件と同じサービス**を呼ぶ（`project_minutes` は `projects` にぶら下がる）。
 * 写すと、文字起こしの投げ方・整形のプロンプト・差分の記録が2つになる。
 */
import {
  listMinutes, getMinutes, startTranscription, updateMinutes, deleteMinutes,
} from '../sales/services/minutes.service';
import { MAX_AUDIO_BYTES, isSttConfigured, normalizeAudioName } from '../sales/services/minutes-ai.service';
import { isActivityAiConfigured } from '../sales/services/activity-ai.service';
/** BOX にファイルを置く・中を見る決めごとは**案件と同じ1本** */
import {
  requireScope, requireFiles, projectFolderId, uploadFiles, listProjectFolder,
} from '../sales/services/project-box-files.service';
import { MAX_UPLOAD_BYTES } from '../../shared/services/box';
/**
 * 帳票（見積書）は**案件と同じ道具**で作り、**同じ行き先表**（`doc-box-dest`）に入れる。
 * 様式や行き先を写すと、片方だけ直した日からプロジェクトの帳票だけ古くなる。
 */
import { buildEstimatePdf } from '../sales/services/estimate-pdf.service';
import {
  fileFinanceDocToBox, docBoxSkipped, applyDocBoxHeaders,
} from '../../shared/services/doc-box.service';
import { createGpmFolderTree, GPM_FOLDER_PREVIEW } from './services/gpm-box-folder.service';

/**
 * **その id はプロジェクト（GLS-B）か。**
 *
 * この口を通せば `gpm` の権限だけで案件（GLS-A）の見積を読み書きできてしまうので、
 * 見積を触るルートは必ずこれを通します。**`gls_category` を落とした瞬間に
 * 権限の壁が消える**ので、書き写さずにこの1本を呼ぶこと。
 */
async function isGpmProject(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  const row = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND gls_category = 'B' AND deleted_at IS NULL`,
    [projectId],
  );
  return !!row;
}

async function assertGpmProject(projectId: string): Promise<void> {
  if (!(await isGpmProject(projectId))) {
    throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
  }
}

export function createGpmRoutes(): Router {
  const router = Router();
  const canRead = [requireAuth, requirePermission('gpm', 'reader')] as const;
  const canEdit = [requireAuth, requirePermission('gpm', 'editor')] as const;
  const canManage = [requireAuth, requirePermission('gpm', 'manager')] as const;

  // ── 標準工程テンプレート ────────────────────────────────
  router.get('/templates', ...canRead, async (_req, res) => {
    res.json({ success: true, data: await templateService.list() });
  });
  router.post('/templates', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await templateService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/templates/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await templateService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  // **消すのは manager。** 適用中のプロジェクトがあっても消せてしまうので、
  // 誤って消したときの影響が大きい（写して使う作りなので既存には影響しないが、
  // 次に作る人が同じ工程を組み直すことになる）
  router.delete('/templates/:id', ...canManage, async (req, res) => {
    await templateService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  // ── プロジェクト（= GLS-B の案件）──────────────────────────
  router.get('/projects', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await projectService.list({
        stage: req.query.stage ? String(req.query.stage) : undefined,
        kind: req.query.kind ? String(req.query.kind) : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
      }),
    });
  });
  router.get('/projects/:id', ...canRead, async (req, res) => {
    const row = await projectService.getById(String(req.params.id));
    if (!row) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' } }); return; }
    res.json({ success: true, data: row });
  });
  router.post('/projects', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await projectService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/projects/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await projectService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/projects/:id', ...canManage, async (req, res) => {
    await projectService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  /**
   * ── BOX フォルダ ────────────────────────────────────────
   *
   * **押したときだけ作る。** プロジェクトを作った流れで自動では作らない —
   * BOX に作ったフォルダはこのアプリからは消せず、人が手で消すことになる。
   * すでに URL を持っていたら 409 で止める（二重に作ると片方が迷子になる）。
   */
  router.get('/projects/:id/box-preview', ...canRead, async (_req, res) => {
    res.json({ success: true, data: GPM_FOLDER_PREVIEW });
  });

  router.post('/projects/:id/box-folder', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    const row = await queryOne(
      `SELECT name, box_url_internal, box_url_external FROM projects
        WHERE id = ? AND gls_category = 'B' AND deleted_at IS NULL`,
      [id],
    ) as { name: string; box_url_internal: string | null; box_url_external: string | null } | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
    if (row.box_url_internal || row.box_url_external) {
      throw new AppError(409, 'ALREADY_EXISTS', 'このプロジェクトの BOX フォルダはすでに作られています');
    }

    const made = await createGpmFolderTree(row.name);
    if (!made.internal && !made.external) {
      throw new AppError(503, 'BOX_UNAVAILABLE', 'BOX にフォルダを作れませんでした。時間をおいて試してください');
    }
    await execute(
      'UPDATE projects SET box_url_internal = ?, box_url_external = ?, updated_at = NOW() WHERE id = ?',
      [made.internal?.folderUrl ?? null, made.external?.folderUrl ?? null, id],
    );
    res.json({ success: true, data: await projectService.getById(id) });
  });

  /**
   * ── 書類（BOX にファイルを置く／中を見る）────────────────────
   *
   * **決めごとは案件と同じ1本**（`project-box-files.service`）。社内限りと社外共有を
   * 取り違えると原価が外に出るので、`scope` に既定を持たせません。
   *
   * **見るほうは BOX が落ちても 200 で返します**（`reason` を添える）— 500 にすると
   * BOX が落ちた日にプロジェクト詳細が全部開けなくなります。**置くほうは失敗を返します** —
   * 上がっていないのに上がったように見えるのが一番困ります。
   *
   * ⚠️ 案件側の「当日の写真」（`subfolder=photos`）は**持ち込んでいません**。
   * プロジェクトのフォルダ構成に `08_写真` は無く（`gpm-box-folder.service`）、
   * 工事の写真をどのフォルダに貯めるかを決めていないためです。
   */
  const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
  });

  router.get('/projects/:id/box-files', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    const scope = req.query.scope === 'internal' ? 'internal' : 'external';
    const { items, reason } = await listProjectFolder(id, scope, 'プロジェクトが見つかりません');
    res.json({ success: true, data: items, ...(reason ? { reason } : {}) });
  });

  router.post('/projects/:id/box-files', ...canEdit, fileUpload.array('files', 5), async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    const scope = requireScope(req.query.scope);
    // **順番を変えない。** ファイルを選ばずに押した人には
    // 「フォルダがありません」ではなく「ファイルを選んでください」を出す
    const files = requireFiles((req.files ?? []) as Express.Multer.File[]);
    const folderId = await projectFolderId(id, scope, {
      notFound: 'プロジェクトが見つかりません',
      noFolder: 'このプロジェクトの BOX フォルダがまだ作られていません。'
        + '書類タブの「BOX フォルダを作る」を押してからお試しください。',
    });
    res.status(201).json({ success: true, data: await uploadFiles(folderId, files) });
  });

  /**
   * ── タスク（⑤ 全プロジェクトのタスク一覧）────────────────
   *
   * **GLS-B のタスクだけを横断で見る口**。案件（GLS-A）のタスクは返しません。
   * migration 179 でタスクにも `project_id` が入ったので、案件管理の一覧・週報・
   * 「自分のタスク」にも出るようになりました（**GLS-B 案件のタスクなので正しい**）。
   * 案件管理の画面には `gls_category = 'A'` の絞り込みで出ません。
   */
  router.get('/tasks', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await gpmTaskService.listAll({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        project_id: typeof req.query.project_id === 'string' ? req.query.project_id : undefined,
      }),
    });
  });
  router.put('/tasks/:id/done', ...canEdit, async (req, res) => {
    res.json({
      success: true,
      data: await gpmTaskService.setDone(String(req.params.id), req.body?.done !== false, req.user!.id),
    });
  });

  /**
   * 足す・直す・消す。**工程の下のタスクを組み替える口**で、
   * 「タスクを足すのは詳細の工程から」と画面に書いてある行き先がこれです。
   *
   * `gpmTaskService` の中で **GLS-B のタスクかどうかを必ず確かめています**
   * （`assertGpmTask`）。ここを通せば `gpm` の権限だけで案件のタスクを
   * 直せてしまうので、確認を飛ばす近道を作らないこと。
   */
  router.post('/projects/:id/tasks', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await gpmTaskService.create(String(req.params.id), req.body ?? {}, req.user!.id),
    });
  });
  router.put('/tasks/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await gpmTaskService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/tasks/:id', ...canEdit, async (req, res) => {
    await gpmTaskService.remove(String(req.params.id), req.user!.id);
    res.json({ success: true, data: { deleted: true } });
  });

  /**
   * ── 見積（⑥ 見積・請求・v4 大⑤・migration 173）────────────
   *
   * `estimates` を案件と共用します（別表にすると版・明細・合計の作りが2つになり、
   * 片方だけ直る形が生まれる）。**案件管理側に混ざらないこと**は
   * `salesOverview`（返事待ち）と `billing.routes`（一覧）の2か所を実測して塞いだ
   * （migration 179 からは、どちらも `gls_category = 'A'` で絞っている）。
   */
  router.get('/projects/:id/estimates', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    const rows = await estimateService.listByProject(id);
    // 「あなたは承認できるか」はサーバーが決める（押して 403 にしない）
    res.json({ success: true, data: await withCanApprove(rows, req.user!.id) });
  });

  router.post('/projects/:id/estimates', ...canEdit, async (req, res) => {
    const row = await estimateService.createForGpm(String(req.params.id), req.body ?? {}, req.user!.id);
    res.status(201).json({ success: true, data: row });
  });

  /**
   * 明細をまとめて置き換える。**案件の見積と同じサービス**（`replaceItems`）を呼ぶ。
   * 合計の計算を写すと、片方だけ直したときに同じ見積が2つの金額を持つ。
   *
   * **プロジェクトの見積しか触らせない。** 案件の見積は `sales` の持ち物で、
   * ここを通せば `gpm` だけの人が案件の金額を書き換えられてしまう
   * （`isGpmProject()` で `gls_category = 'B'` を確かめる）。
   */
  /**
   * 見積のまとめ（ダッシュボードの KPI 2枚ぶん）。
   *
   * ⚠️ **`/estimates/:id` より前に置くこと。** 後ろに置くと `summary` が id として
   * 食われ、**常に 404** になります（実 API を叩いて見つけた。型にも lint にも出ない）。
   */
  router.get('/estimates/summary', ...canRead, async (_req, res) => {
    res.json({ success: true, data: await gpmEstimateSummary() });
  });

  /** 1本ぶん（**明細つき**）。一覧は明細を積まない（重いので） */
  router.get('/estimates/:id', ...canRead, async (req, res) => {
    const row = await estimateService.getById(String(req.params.id));
    if (!row || !(await isGpmProject(row.project_id))) {
      throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    }
    res.json({ success: true, data: (await withCanApprove([row], req.user!.id))[0] });
  });

  /**
   * 値引きの承認。**案件と同じ規則・同じサービス**（`estimateService.approve`）で、
   * 分けたのは口だけです — 案件側のルートは `sales` を要求するので、
   * `gpm` だけの人は自分のプロジェクトの見積を承認できません。
   *
   * **承認できるかの判定はサービスが持ちます**（作った人の役割に決めた承認者だけ）。
   * ここで別の規則を書くと、プロジェクトの見積だけ違う人が承認できてしまいます。
   */
  router.post('/estimates/:id/approve', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    const row = await estimateService.getById(id);
    if (!row || !(await isGpmProject(row.project_id))) {
      throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    }
    res.json({ success: true, data: await estimateService.approve(id, req.user!.id) });
  });

  /**
   * 見積書 PDF を発行する。**案件と同じ道具・同じ行き先表**を呼びます
   * （`buildEstimatePdf` ＋ `fileFinanceDocToBox`）。写すと、様式を直した日から
   * プロジェクトの見積書だけ古い形で出ます。
   *
   * ── なぜ GPM 側に口が要るのか ────────────────────────────────
   *
   * 案件側の `GET /projects/:pid/estimates/:id/pdf` は **`sales` を要求**するので、
   * `gpm` だけの人は自分のプロジェクトの見積書を出せませんでした
   * （議事録・書類と同じ形の穴）。ここは `gpm` で通し、**プロジェクトの見積しか
   * 受け付けません**（`isGpmProject`）。
   *
   * ── 出すのは reader・BOX に置くのは editor 以上（案件と同じ）──
   *
   * 金額はこの人たちも画面で見えているので、紙にするだけなら止める理由がない。
   * 置けなかったときは**理由を応答ヘッダーで返す** — 黙って落とすと
   * 「保存したつもり」で手元にしか無い帳票ができます。
   */
  router.get('/estimates/:id/pdf', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    const row = await estimateService.getById(id);
    if (!row || !(await isGpmProject(row.project_id))) {
      throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    }
    const { buffer, filename, projectId } = await buildEstimatePdf(id);
    const canStore = meetsPermissionLevel(req.user!.role, req.user!.permissions?.gpm, 'editor');
    applyDocBoxHeaders(res, canStore
      ? await fileFinanceDocToBox(projectId, 'estimate', filename, buffer)
      : docBoxSkipped('estimate', 'NO_PERMISSION'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  });

  router.put('/estimates/:id/items', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    const row = await estimateService.getById(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (!(await isGpmProject(row.project_id))) {
      throw new AppError(403, 'FORBIDDEN', 'これは案件の見積です。案件管理の画面から直してください。');
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    res.json({ success: true, data: await estimateService.replaceItems(id, items) });
  });

  /**
   * ── 議事録（打合せを録音 → 文字起こし → AI 整形）────────────
   *
   * **案件と同じ表・同じサービス**（`project_minutes` / `minutes.service`）を呼びます。
   * `project_minutes.project_id` は `projects(id)` を指し、プロジェクトは GLS-B の案件なので
   * そのまま載ります。**別表にすると、Whisper の投げ方・整形のプロンプト・
   * 差分の記録（`ai_corrections`）が2つになり、片方だけ直る形が生まれます。**
   *
   * 口を分けているのは**権限だけ**です — 案件側のルートは `sales` を要求するので、
   * `gpm` だけの人は自分のプロジェクトの議事録を開けません。逆に、この口から
   * 案件（GLS-A）の議事録を触れないよう `assertGpmProject` / `assertGpmMinutes` を通します。
   *
   * ⚠️ **音声はディスクに置きません**（`memoryStorage`）。文字起こしが済んだら捨てます —
   * 取引先の声が入るものを、消し忘れの起きる場所に置かない（案件側と同じ決めごと）。
   */
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  });

  /** その議事録はプロジェクト（GLS-B）のものか。**案件の議事録を触らせない** */
  async function assertGpmMinutes(minutesId: string): Promise<void> {
    const row = await queryOne(
      `SELECT m.id FROM project_minutes m
         JOIN projects p ON p.id = m.project_id
        WHERE m.id = ? AND m.deleted_at IS NULL
          AND p.gls_category = 'B' AND p.deleted_at IS NULL`,
      [minutesId],
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '議事録が見つかりません');
  }

  router.get('/projects/:id/minutes', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    res.json({
      success: true,
      data: await listMinutes(id),
      // **押してから「使えません」は最悪**。文字起こしと整形は別の鍵で動く
      stt_available: isSttConfigured(),
      ai_available: isActivityAiConfigured(),
    });
  });

  /** 1件（**文字起こし全文つき**）。一覧は全文を積まない（重いので） */
  router.get('/minutes/:id', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmMinutes(id);
    res.json({ success: true, data: await getMinutes(id) });
  });

  router.post('/projects/:id/minutes', ...canEdit, audioUpload.single('audio'), async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    if (!isSttConfigured()) {
      // **400 で理由を返す。** 500 だと「壊れた」と読まれるが、これは設定の話
      throw new AppError(400, 'NOT_CONFIGURED',
        'この環境は文字起こしにつないでいません（OPENAI_API_KEY 未設定）。管理者にご連絡ください');
    }
    const file = req.file;
    if (!file) throw new AppError(400, 'VALIDATION_ERROR', '音声が添付されていません');
    const metOn = typeof req.body?.met_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.met_on)
      ? req.body.met_on : null;
    const row = await startTranscription(
      id,
      file.buffer,
      // multer は multipart のファイル名を latin1 で読む（日本語が化ける）。
      // 中身と拡張子が食い違っていたら直す（Safari は mp4 を返すのに `.webm` で送られる）
      normalizeAudioName(
        Buffer.from(file.originalname || 'recording.webm', 'latin1').toString('utf8'),
        file.mimetype,
      ),
      metOn,
      req.user!.id,
    );
    res.status(202).json({ success: true, data: row });
  });

  router.put('/minutes/:id', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmMinutes(id);
    res.json({ success: true, data: await updateMinutes(id, req.body ?? {}, req.user!.id) });
  });

  /**
   * 持ち帰りを**未確認事項にする**（案件側はタスクにする）。
   * 工事・構築の持ち帰りはほとんどが「先方の判断待ち」で、タスクにすると
   * 「自分がやること」に相手待ちが混ざり、**止まっている件数が数えられません**。
   */
  router.post('/minutes/:id/open-items/:index/ask', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmMinutes(id);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '持ち帰りの位置が正しくありません');
    }
    res.status(201).json({ success: true, data: await openItemToAsk(id, index, req.user!.id) });
  });

  // **消すのは manager。** 取引先との合意の記録なので、1人の判断で消させない
  router.delete('/minutes/:id', ...canManage, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmMinutes(id);
    await deleteMinutes(id, req.user!.id);
    res.json({ success: true, data: { deleted: true } });
  });

  // ── 体制（組織図のメンバー・migration 169）────────────────
  router.post('/projects/:id/members', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await memberService.add(String(req.params.id), req.body ?? {}),
    });
  });
  router.put('/members/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await memberService.update(String(req.params.id), req.body ?? {}) });
  });
  router.delete('/members/:id', ...canEdit, async (req, res) => {
    await memberService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  /**
   * ── 工程 ────────────────────────────────────────────────
   *
   * **消すのは配下のタスクを外すだけ**（`phaseService.remove` が
   * `gpm_phase_id` を NULL にする）。タスクごと消える口は作りません —
   * 工程を1つ消しただけで何十件のタスクが消えるのは元に戻せません。
   */
  router.post('/projects/:id/phases', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await phaseService.create(String(req.params.id), req.body ?? {}),
    });
  });
  router.put('/phases/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await phaseService.update(String(req.params.id), req.body ?? {}) });
  });
  router.put('/phases/:id/move', ...canEdit, async (req, res) => {
    const dir = req.body?.dir === 'up' ? 'up' : 'down';
    res.json({ success: true, data: await phaseService.move(String(req.params.id), dir) });
  });
  router.delete('/phases/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await phaseService.remove(String(req.params.id)) });
  });

  // ── 未確認事項 ──────────────────────────────────────────
  // **プロジェクトをまたいで引ける**のがこの表を作った理由
  // （議事録の JSONB では「いま何件止まっているか」を数えられない）
  router.get('/open-items', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await openItemService.listAll({ status: req.query.status ? String(req.query.status) : undefined }),
    });
  });
  router.post('/projects/:id/open-items', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await openItemService.create(String(req.params.id), req.body ?? {}, req.user!.id),
    });
  });
  router.put('/open-items/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await openItemService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/open-items/:id', ...canEdit, async (req, res) => {
    await openItemService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  return router;
}
