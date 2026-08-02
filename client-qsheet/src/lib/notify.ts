import { toast } from '@gmo-onair/shared/src/client/ui';

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
