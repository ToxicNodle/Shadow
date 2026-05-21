import { useAppStore } from '../store/useAppStore';
import type { ToastMessage } from '../store/useAppStore';

// Imperative toast helper for use outside React components (event handlers,
// async callbacks). Mirrors the `showToast` action on the Zustand store.
export function showToast(message: string, type: ToastMessage['type'] = 'success') {
  useAppStore.getState().showToast(message, type);
}
