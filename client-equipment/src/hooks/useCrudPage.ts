/**
 * client-equipment 用 useCrudPage バインディング (Phase 2B)
 *
 * shared の factory に api インスタンスを渡してフックを作る。
 */
import { createUseCrudPage } from '@gmo-onair/shared/src/client/hooks/useCrudPage';
import api from '@/lib/api';

export const useCrudPage = createUseCrudPage(api);
