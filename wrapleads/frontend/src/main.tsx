import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { ApiError } from './api/client';
import { useAppStore } from './store/useAppStore';
import './styles/globals.css';
import './styles/components.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 402 || error.status === 403)) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      onError: (error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 402)) return;
        const msg = error instanceof Error ? error.message : 'Something went wrong';
        useAppStore.getState().showToast(msg, 'error');
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
