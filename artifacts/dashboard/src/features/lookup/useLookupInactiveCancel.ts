import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useLookupInactiveCancel(isActive: boolean, queryKey: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isActive) {
      void queryClient.cancelQueries({ queryKey: [queryKey] });
    }
  }, [isActive, queryClient, queryKey]);
}
