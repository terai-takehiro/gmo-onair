import { Router } from 'express';
import { requireAuth, requirePermission, requireAnyPermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { isBoxConfigured, ensureSubfolder, uploadToFolder } from '../../../shared/services/box';
import { keepDeckService } from '../services/keep-deck.service';
import { renderDeckPptx, deckFileName, deckFolderName } from '../services/keep-pptx.service';
import { loadPreviousPack } from '../services/keep-prev-pack.service';

// 日常業務アプリ (dailyops) — 隔週キープの「資料をつくる」（構成の版・差分・pptx 出力）。
// 読む: dailyops か sales の reader（財務の数字なので営業・経理も見る）。書く: dailyops の editor。
// 設計は docs/design/v4/keep-report.md §6・§9・§10。`/dailyops` の下に index.ts が載せる。

const router = Router();
const canRead = [requireAuth, requireAnyPermission(['dailyops', 'sales'], 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// 構成の一覧（会議日・版・出力の有無）
router.get('/keep/decks', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await keepDeckService.listDecks() });
});

// 会議日の構成（無ければ前回の構成／標準の構成から組んで版1を作る）
// → { deck, pack, pack_frozen, previous_meeting_date }
// `?create=0` は読むだけ（無ければ 404）。「前回の資料と見比べる」で版1を作ってしまわないため
router.get('/keep/decks/:meeting', ...canRead, async (req, res) => {
  const meeting = String(req.params.meeting);
  if (req.query.create === '0') {
    const data = await keepDeckService.getDeckIfExists(meeting);
    if (!data) throw new AppError(404, 'NOT_FOUND', 'その会議日の資料の構成はまだありません');
    res.json({ success: true, data });
    return;
  }
  const data = await keepDeckService.getOrCreateDeck(meeting, req.user!.id);
  res.json({ success: true, data });
});

// 版ごとの人の直し（?version= 省略で最新）
router.get('/keep/decks/:meeting/edits', ...canRead, async (req, res) => {
  const version = req.query.version != null ? Number(req.query.version) : undefined;
  if (version != null && !Number.isInteger(version)) throw new AppError(400, 'VALIDATION_ERROR', 'version は整数で指定してください');
  res.json({ success: true, data: await keepDeckService.listEdits(String(req.params.meeting), version) });
});

// 人の保存。body: { deck: { pages: SlidePage[], version?: number } } → { deck, version, edits }
router.put('/keep/decks/:meeting', ...canEdit, async (req, res) => {
  const body = req.body?.deck;
  if (!body || typeof body !== 'object') throw new AppError(400, 'VALIDATION_ERROR', 'deck がありません');
  const expected = typeof body.version === 'number' ? body.version : null;
  const data = await keepDeckService.saveDeck(String(req.params.meeting), body, req.user!.id, expected);
  res.json({ success: true, data });
});

// 自動ページをいまのパック（凍結版があればそれ）で組み直す。人の直しは残る
router.post('/keep/decks/:meeting/rebuild', ...canEdit, async (req, res) => {
  const data = await keepDeckService.rebuildDeck(String(req.params.meeting), req.user!.id);
  res.json({ success: true, data });
});

/**
 * pptx を作って返す。KEEP_REPORT_BOX_FOLDER_ID があり Box につながっていれば
 * `<YYMMDD>/` のサブフォルダに置き、応答ヘッダーに載せる（本文は pptx なので JSON の置き場が無い。
 * `doc-box.service.ts` の `applyDocBoxHeaders` と同じ約束: X-Box-Stored / X-Box-Reason / X-Box-File-Id / X-Box-File-Url）。
 * 検査の警告は X-Keep-Warnings（%エンコードした JSON の配列）。
 */
router.post('/keep/decks/:meeting/export', ...canEdit, async (req, res) => {
  const meeting = String(req.params.meeting);
  const { deck, pack, inputs: storedInputs } = await keepDeckService.getOrCreateDeck(meeting, req.user!.id);
  const meetingTitle = typeof req.body?.meeting_title === 'string' ? req.body.meeting_title : null;
  // 手入力は保存済みのもの（keep_report_inputs）を土台に、body で渡された分を上書き
  const bodyInputs = req.body?.inputs && typeof req.body.inputs === 'object' ? (req.body.inputs as Record<string, unknown>) : {};
  const inputs = { ...storedInputs, ...bodyInputs };
  // 「変更点は赤字」の比較相手 = 会議日より前でいちばん新しい凍結した版（無ければ赤字なし・脚注なし）
  const previousPack = await loadPreviousPack(meeting);
  const { buffer, pages, warnings } = await renderDeckPptx(deck, pack, { meeting_title: meetingTitle, inputs, previousPack });
  const filename = deckFileName(meeting);

  const folderId = process.env.KEEP_REPORT_BOX_FOLDER_ID;
  let stored = false;
  let reason: string | null = null;
  if (!folderId) reason = 'NOT_CONFIGURED';
  else if (!isBoxConfigured()) reason = 'NOT_CONFIGURED';
  else {
    try {
      const sub = await ensureSubfolder(folderId, deckFolderName(meeting));
      if (!sub) reason = 'NO_SUBFOLDER';
      else {
        const item = await uploadToFolder(sub.id, filename, buffer);
        await keepDeckService.markExported(meeting, item.id, req.user!.id);
        stored = true;
        res.setHeader('X-Box-File-Id', item.id);
        res.setHeader('X-Box-File-Url', item.url);
        res.setHeader('X-Box-Where', encodeURIComponent(`Box ${sub.name}/`));
      }
    } catch (err) {
      // Box が落ちていてもダウンロードは止めない（帳票の BOX 格納と同じ方針）。理由はヘッダーで返す
      console.warn('[keep-deck] Box upload failed:', (err as Error).message);
      reason = 'UNAVAILABLE';
    }
  }
  res.setHeader('X-Box-Stored', stored ? '1' : '0');
  if (reason) res.setHeader('X-Box-Reason', reason);
  res.setHeader('X-Keep-Pages', String(pages));
  res.setHeader('X-Keep-Warnings', encodeURIComponent(JSON.stringify(warnings)));
  res.setHeader('Access-Control-Expose-Headers',
    'Content-Disposition, X-Box-Stored, X-Box-Reason, X-Box-File-Id, X-Box-File-Url, X-Box-Where, X-Keep-Pages, X-Keep-Warnings');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});

export default router;
