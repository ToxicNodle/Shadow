import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, logout } from '../api/client';
import type { User } from '../api/types';

export function useAuth() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me().then((r) => r.user),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function handleLogout() {
    qc.clear();
    logout();
  }

  return {
    user: query.data as User | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    logout: handleLogout,
  };
}
