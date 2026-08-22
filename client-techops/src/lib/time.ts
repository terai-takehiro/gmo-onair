// 共通時刻ユーティリティの再輸出。
// 実装は shared/src/schedule/time.ts に一本化されている
// (サーバーからも同じ規則で呼べるよう、server/src/shared/schedule/time.ts に複製あり)。
export {
  parseDur,
  normalizeDur,
  fmtAbs,
  fmtMinSec,
  fmtMmSs,
  docTotalSec,
  type DocTotalSecOptions,
  type DocTotalSecRow,
  type DocTotalSecSection,
} from "@gmo-onair/shared/src/schedule/time";
