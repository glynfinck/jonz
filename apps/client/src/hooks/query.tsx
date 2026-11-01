import { focusManager, MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { noteError } from '@/api/report-details';

/** A read or a move that failed, kept as the last error a report can carry. */
const noted = (error: unknown) => noteError(error instanceof Error ? error.message : String(error));

/**
 * One cache for everything the app reads. On iOS and Android "focus" is the
 * app coming back to the foreground (React Query listens to the browser's
 * own focus on the web), so a phone that slept refetches what it shows.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: noted }),
        mutationCache: new MutationCache({ onError: noted }),
        defaultOptions: {
          // A tick or a vote elsewhere arrives through Realtime; this is the floor.
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
