// liveops/crypto.ts — **中身はここには無い**。
//
// 実装は `server/src/shared/utils/secret-box.ts` に引き上げた（08 で qsheet の
// ストリームキー暗号化にも同じ仕組みが要り、qsheet から liveops を import すると
// コンテキストをまたぐため）。呼び出し側（`liveops` の各ルート）は書き換えていない
// — import 元がここのままで動く。
//
// ⚠️ 鍵の導き方・暗号文の形式は1文字も変えていない。`liveops_settings` に
// 既に入っている暗号文はそのまま読める。
export { encrypt, decrypt, mask } from '../../shared/utils/secret-box';
