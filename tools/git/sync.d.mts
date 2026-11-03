export const REPO_ROOT: string;
export function isMainWorktree(cwd?: string): boolean;
export function syncMain(opts?: { fetch?: boolean }): {
  branch: string;
  behind: number;
  ahead: number;
  dirty: boolean;
  synced: number;
  fetched: boolean;
  problems: string[];
};
