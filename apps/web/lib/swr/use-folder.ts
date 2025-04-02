import { Folder } from "@/lib/types";
import { fetcher } from "@dub/utils";
import useSWR from "swr";
import useWorkspace from "./use-workspace";

export default function useFolder({
  folderId,
  enabled: enabledOverride,
}: {
  folderId?: string | null;
  enabled?: boolean;
}) {
  const { id: workspaceId, plan, flags } = useWorkspace();

  const defaultEnabled =
    folderId &&
    folderId !== "unsorted" &&
    workspaceId &&
    flags?.linkFolders &&
    plan !== "free";

  const enabled =
    enabledOverride !== undefined ? enabledOverride : defaultEnabled;

  const {
    data: folder,
    isValidating,
    isLoading,
  } = useSWR<Folder>(
    enabled ? `/api/folders/${folderId}?workspaceId=${workspaceId}` : null,
    fetcher,
    {
      dedupingInterval: 60000,
      keepPreviousData: true,
    },
  );

  return {
    folder,
    loading: isLoading,
    isValidating,
  };
}
