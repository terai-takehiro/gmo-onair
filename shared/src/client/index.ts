// Client-shared exports — used by all sub-app clients
export { cn } from './utils';
export { queryClient } from './queryClient';
export { useUiStore, type UiState } from './uiStore';
export { createApi, type ApiConfig } from './createApi';
export { createAuthHook, type AuthHookConfig } from './createAuthHook';
