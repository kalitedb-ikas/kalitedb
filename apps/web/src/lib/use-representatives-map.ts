import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Representative } from "@kalitedb/shared";

import { api } from "./api";
import { useAuth } from "./auth";

export function useRepresentativesMap(): Map<string, Representative> {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  return useMemo(() => {
    const reps = query.data ?? [];
    return new Map(reps.map((r) => [r.key, r]));
  }, [query.data]);
}
