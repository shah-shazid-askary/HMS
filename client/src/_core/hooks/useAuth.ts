import { trpc } from "@/lib/trpc";
import { clearHmsSessionCache } from "@/lib/sessionCache";
import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      try {
        localStorage.removeItem("hms-auth-token");
        sessionStorage.removeItem("hms-auth-token");
        localStorage.removeItem("hms-user-session");
      } catch {}
      await clearHmsSessionCache(queryClient);
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      if (redirectPath) {
        window.location.href = redirectPath;
      }
    }
  }, [logoutMutation, queryClient, redirectPath, utils]);

  const state = useMemo(() => {
    try {
      if (meQuery.data) {
        localStorage.setItem("hms-user-session", JSON.stringify(meQuery.data));
      } else {
        localStorage.removeItem("hms-user-session");
      }
    } catch {}
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
