// 操作フィードバックは **消えないお知らせ帯** に出す (トーストは使わない・§4.15)。
// 流れて消えると「保存に失敗した」ことに気づけないため、人が閉じるまで残す。
import { setNotice } from '@gmo-onair/shared/src/client/ui';

type NotifyOptions = { description?: string };

export function notifySuccess(message: string, options?: NotifyOptions) {
  setNotice({ tone: 'success', title: message, description: options?.description });
}
export function notifyError(message: string, options?: NotifyOptions) {
  setNotice({ tone: 'error', title: message, description: options?.description });
}
export function notifyInfo(message: string, options?: NotifyOptions) {
  setNotice({ tone: 'info', title: message, description: options?.description });
}
export function notifyWarning(message: string, options?: NotifyOptions) {
  setNotice({ tone: 'warning', title: message, description: options?.description });
}
