/*
 * **トーストはこのアプリ (凍結) だけが使う。**
 * v4 の3アプリは「流れて消えない帯」(`shared/src/client/notify.ts` + `<NoticeBar />`) に
 * 移った。2つの仕組みが混ざらないよう、トーストは**共通バレルから外して**
 * 深いパスでの名指しだけにしてある (P3)。
 * このアプリを v4 に載せ替えるとき (v4.1 以降) に帯へ寄せる。
 */
import { toast } from '@gmo-onair/shared/src/client/ui/use-toast';

type NotifyOptions = {
  description?: string;
  duration?: number;
};

export function notifySuccess(message: string, options?: NotifyOptions) {
  return toast({
    variant: 'success',
    title: message,
    description: options?.description,
    duration: options?.duration ?? 3000,
  });
}

export function notifyError(message: string, options?: NotifyOptions) {
  return toast({
    variant: 'destructive',
    title: message,
    description: options?.description,
    duration: options?.duration ?? 5000,
  });
}

export function notifyInfo(message: string, options?: NotifyOptions) {
  return toast({
    variant: 'info',
    title: message,
    description: options?.description,
    duration: options?.duration ?? 3000,
  });
}

export function notifyWarning(message: string, options?: NotifyOptions) {
  return toast({
    variant: 'warning',
    title: message,
    description: options?.description,
    duration: options?.duration ?? 4000,
  });
}
