/**
 * 運営マニュアル — `link.reveal.by`/`at`（秘密（配信の鍵・WEB会議のパスコード）を紙に
 * 出した人・時刻）の書き換え防止（§7-2）。純関数のみ（DB・Express に依存しない）。
 * `manual-pages.routes.ts` から呼ばれる——ここに切り出したのは `loadTs`（server/tests/
 * helpers/load-ts.mjs）でルートファイルを丸ごと読み込まず、この関数だけを直接
 * テストできるようにするため（`manual-resolve.service.ts` と同じ理由での分離）。
 *
 * `manual.service.ts` の `blocks` は「型はここでは検証しない — クライアントの契約を
 * 信じる」設計だが、`reveal.by`/`at` だけはこの契約の例外にする——ここで強制しないと、
 * devtools でリクエストボディを書き換えて任意の他ユーザーIDや時刻を詐称でき、
 * 監査証跡が意味を持たなくなる（レビュー指摘）。ブロックの残りの中身（形・座標・
 * 自由ブロックの content 等）は従来どおり検証しない。
 *
 * ⚠️⚠️ 外部レビュー再指摘（P2）: 以前は「reveal がある全ブロックへ無条件で
 * by=いま保存している本人」を書いていた——紙面は毎回ページ全体（触っていない他の
 * ブロックも含む）を送るため、editor A が解除した直後に editor B が**別のブロックを
 * 動かしただけ**でも、Aの `reveal.by` が B に書き換わってしまい（`at` はAのまま）、
 * 監査証跡が誰の操作かを取り違える。`existingBlocks`（保存直前の DB 上の状態）と
 * 突き合わせ、`reveal.fields` が前回と同じ（＝解除の中身自体は変えていない）なら
 * 既存の reveal（by・at とも）をそのまま保つ。新規に解除した／fields を変えた
 * ときだけ、いま保存している本人といまの時刻で server が付け直す。
 */
function revealFieldsKey(fields: unknown): string {
  if (!Array.isArray(fields)) return '';
  return fields.filter((f): f is string => typeof f === 'string').slice().sort().join(',');
}

export function enforceRevealAuthorship(blocks: unknown[], existingBlocks: unknown[], userId: string): unknown[] {
  const existingById = new Map<string, Record<string, unknown>>();
  for (const eb of existingBlocks) {
    if (eb && typeof eb === 'object' && typeof (eb as Record<string, unknown>).id === 'string') {
      existingById.set((eb as Record<string, unknown>).id as string, eb as Record<string, unknown>);
    }
  }

  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return block;
    const b = block as Record<string, unknown>;
    if (b.kind !== 'linked' || !b.link || typeof b.link !== 'object') return block;
    const link = b.link as Record<string, unknown>;
    if (!link.reveal || typeof link.reveal !== 'object') return block;
    const incomingReveal = link.reveal as Record<string, unknown>;

    const existingLink = typeof b.id === 'string' ? existingById.get(b.id)?.link : undefined;
    const existingReveal = existingLink && typeof existingLink === 'object'
      ? (existingLink as Record<string, unknown>).reveal
      : undefined;

    if (existingReveal && typeof existingReveal === 'object'
        && revealFieldsKey((existingReveal as Record<string, unknown>).fields) === revealFieldsKey(incomingReveal.fields)) {
      return { ...b, link: { ...link, reveal: existingReveal } }; // 中身が同じ＝解除操作なし。監査証跡は変えない
    }
    return { ...b, link: { ...link, reveal: { ...incomingReveal, by: userId, at: new Date().toISOString() } } };
  });
}
