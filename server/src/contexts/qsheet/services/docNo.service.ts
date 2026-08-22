/**
 * 資料番号（`doc_no`）の採番。
 *
 * 中身は既存のアトミックな採番関数 `generateSequenceNumber()` を
 * `MINI_APPS` レジストリの `docPrefix` / `docNoSeq` で呼ぶだけ。
 * 採番ロジック自体を作り直さない（01 §8-4）。
 *
 * 呼ぶのは `POST /qsheet/documents` の **`project_id` が無いときだけ**
 * （案件に紐づく資料は GLS 番号が主なので、資料番号は不要）。
 */
import { generateSequenceNumber } from '../../../shared/services/sequence.service';
import { MINI_APP_BY_KEY, type MiniAppKey } from '../../../shared/production/miniapps';

export async function issueDocNo(app: MiniAppKey): Promise<string> {
  const def = MINI_APP_BY_KEY[app];
  if (def.kind !== 'document') {
    throw new Error(`issueDocNo: '${app}' は document ではありません（kind=${def.kind}）`);
  }
  return generateSequenceNumber(def.docNoSeq, def.docPrefix);
}
