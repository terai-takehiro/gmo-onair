/**
 * client (案件管理メインアプリ) 用 useCrudPage バインディング (Phase 2A)
 *
 * shared の factory に api インスタンスを渡してフックを作る。
 * 他アプリも同じパターンで自分の api を渡してバインドする。
 */
import { createUseCrudPage } from '@gmo-onair/shared/src/client/hooks/useCrudPage';
import api from '@/lib/api';

export const useCrudPage = createUseCrudPage(api);
