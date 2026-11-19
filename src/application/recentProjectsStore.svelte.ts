export const RECENT_PROJECTS_STORAGE_KEY = 'lonestar-recent-projects';
export const MAX_RECENT_PROJECTS = 10;

export interface RecentProjectEntry {
  path: string;
  name: string;
  fileName: string;
  lastOpenedAt: string;
}

export function extractFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]+/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? filePath;
}

export function isFileNotFoundError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('file_not_found') ||
    msg.includes('no such file or directory') ||
    msg.includes('cannot find the file') ||
    msg.includes('cannot find the path') ||
    msg.includes('os error 2') ||
    msg.includes('os error 3') ||
    msg.includes('enoent')
  );
}

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadPersistedRecentProjects(): RecentProjectEntry[] {
  const storage = getSafeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const normalized: RecentProjectEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Partial<RecentProjectEntry>;
      const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
      if (!path || seen.has(path)) continue;
      seen.add(path);

      const fileName =
        typeof candidate.fileName === 'string' && candidate.fileName.trim()
          ? candidate.fileName.trim()
          : extractFileName(path);
      const name =
        typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim()
          : fileName;
      const lastOpenedAt =
        typeof candidate.lastOpenedAt === 'string' && candidate.lastOpenedAt.trim()
          ? candidate.lastOpenedAt
          : '';

      normalized.push({ path, name, fileName, lastOpenedAt });
      if (normalized.length >= MAX_RECENT_PROJECTS) break;
    }
    return normalized;
  } catch {
    return [];
  }
}

function savePersistedRecentProjects(entries: RecentProjectEntry[]): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

class RecentProjectsStore {
  entries = $state<RecentProjectEntry[]>(loadPersistedRecentProjects());

  recordProject(path: string, diagramName?: string): RecentProjectEntry | null {
    const cleanPath = path.trim();
    if (!cleanPath) return null;

    const fileName = extractFileName(cleanPath);
    const name = diagramName?.trim() || fileName;
    const entry: RecentProjectEntry = {
      path: cleanPath,
      name,
      fileName,
      lastOpenedAt: new Date().toISOString(),
    };

    const next = [entry, ...this.entries.filter((e) => e.path !== cleanPath)].slice(
      0,
      MAX_RECENT_PROJECTS,
    );
    this.entries = next;
    savePersistedRecentProjects(next);
    return entry;
  }

  removeProject(path: string): void {
    const next = this.entries.filter((e) => e.path !== path);
    if (next.length === this.entries.length) return;
    this.entries = next;
    savePersistedRecentProjects(next);
  }

  clearAll(): void {
    this.entries = [];
    savePersistedRecentProjects([]);
  }
}

export const recentProjectsStore = new RecentProjectsStore();
