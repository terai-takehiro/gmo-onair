import { Router, type Request } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, meetsPermissionLevel } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { isBoxConfigured, ensureSubfolder, uploadToFolder } from '../../../shared/services/box';
import { keepDeckService } from '../services/keep-deck.service';
import { renderDeckPptx, deckFileName, deckFolderName } from '../services/keep-pptx.service';
import { loadPreviousPack } from '../services/keep-prev-pack.service';

// 日常業務アプリ (dailyops) — 隔週キープの「資料をつくる」（構成の版・差分・pptx 出力）。
// 読む: dailyops か sales の reader（財務の数字なので営業・経理も見る）。書く: dailyops の editor。
// 設計は docs/design/v4/keep-report.md §6・§9・§10。`/dailyops` の下に index.ts が載せる。
//
// ── 「開く」と「作る」───────────────────────────────────────
// 構成が無い会議日を初めて開くと版1（auto）が**作られる**。作るのは書く操作なので
// `dailyops` の editor だけ: GET /keep/decks/:meeting は、構成があれば誰でも（reader）読めるが、
// 無いときは editor にだけ作って返し、reader には 404 を返す（読むだけの人が版1を作ってしまわない）。
// 明示的に作る口として POST /keep/decks/:meeting（editor）も置く。画面は今までどおり GET で開けばよい。

const router = Router();
const canRead = [requireAuth, requireAnyPermission(['dailyops', 'sales'], 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/** `requirePermission('dailyops', 'editor')` と同じ判定（`meetsPermissionLevel`）を、読む口の中で1回だけ使う */
const isDailyopsEditor = (req: Request): boolean =>
  meetsPermissionLevel(req.user?.role, req.user?.permissions?.dailyops, 'editor');

// ── X-Keep-Warnings（%エンコードした JSON の配列）の上限 ─────────────
// 警告は部品ごとに出るので、材料の壊れた資料では数十件・数 KB になる。応答ヘッダーは
// プロキシ（nginx の既定 8KB）で切られると**本文の pptx ごと 502** になるので、
// 先頭 5 件・2,000 バイトまでに切り、全件数は X-Keep-Warnings-Total で別に返す
const MAX_WARNINGS_IN_HEADER = 5;
const MAX_WARNINGS_HEADER_BYTES = 2000;
export function encodeWarningsHeader(all: string[]): string {
  let list = all.slice(0, MAX_WARNINGS_IN_HEADER);
  let encoded = encodeURIComponent(JSON.stringify(list));
  while (encoded.length > MAX_WARNINGS_HEADER_BYTES && list.length > 0) {
    const last = list[list.length - 1];
    // 長すぎる1件は半分に切って「…」、短いのに超えるなら件数を減らす
    if (last.length > 40) list[list.length - 1] = `${last.slice(0, Math.floor(last.length / 2))}…`;
    else list = list.slice(0, -1);
    encoded = encodeURIComponent(JSON.stringify(list));
  }
  return encoded;
}

// 構成の一覧（会議日・版・出力の有無）
router.get('/keep/decks', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await keepDeckService.listDecks() });
});

// 会議日の構成 → { deck, pack, pack_frozen, previous_meeting_date, inputs }
// あれば誰でも（reader）読める。無いときは dailyops の editor にだけ前回の構成／標準の構成から
// 版1を組んで返し、reader には 404（読むだけの人が版1を作らない）。
// `?create=0` は editor でも読むだけ（無ければ 404）。「前回の資料と見比べる」で版1を作ってしまわないため
router.get('/keep/decks/:meeting', ...canRead, async (req, res) => {
  const meeting = String(req.params.meeting);
  const existing = await keepDeckService.getDeckIfExists(meeting);
  if (existing) {
    res.json({ success: true, data: existing });
    return;
  }
  if (req.query.create === '0' || !isDailyopsEditor(req)) {
    throw new AppError(404, 'NOT_FOUND', 'その会議日の資料の構成はまだありません');
  }
  const data = await keepDeckService.getOrCreateDeck(meeting, req.user!.id);
  res.json({ success: true, data });
});

// 会議日の構成を作る（あればそれを返す）。GET が editor に対してすることを明示的に呼ぶ口
router.post('/keep/decks/:meeting', ...canEdit, async (req, res) => {
  const meeting = String(req.params.meeting);
  const before = await keepDeckService.getDeckIfExists(meeting);
  const data = before ?? await keepDeckService.getOrCreateDeck(meeting, req.user!.id);
  res.status(before ? 200 : 201).json({ success: true, data });
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
 * 検査の警告は X-Keep-Warnings（%エンコードした JSON の配列・先頭 5 件・2,000 バイトまで）と
 * X-Keep-Warnings-Total（全件数）。
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
        await keepDeckService.markExported(meeting, item.id, req.user!.id, deck.version);
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
  res.setHeader('X-Keep-Warnings', encodeWarningsHeader(warnings));
  res.setHeader('X-Keep-Warnings-Total', String(warnings.length));
  res.setHeader('Access-Control-Expose-Headers',
    'Content-Disposition, X-Box-Stored, X-Box-Reason, X-Box-File-Id, X-Box-File-Url, X-Box-Where, X-Keep-Pages, X-Keep-Warnings, X-Keep-Warnings-Total');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});

export default router;
