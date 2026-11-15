import type { Update } from '@tauri-apps/plugin-updater';
import { backendAdapter, isTauriRuntime } from '../infrastructure/backendAdapter';
import { uiStore } from './uiStore.svelte';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installed'
  | 'error';

const AUTO_UPDATE_KEY = 'lonestar-auto-update';
const REPO_SLUG = 'Vinello28/lonestar';

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function matchAssetSuffixes(platform: string, arch: string): string[] {
  const p = platform.toLowerCase();
  const a = arch.toLowerCase();
  if (p.includes('win')) return ['.msi', '-setup.exe', '.exe'];
  if (p.includes('mac') || p.includes('darwin')) {
    return a.includes('x86_64') || a.includes('amd64')
      ? ['x64.dmg', 'x86_64.dmg', '.dmg']
      : ['aarch64.dmg', '.dmg'];
  }
  return ['.appimage', '.deb', '.rpm'];
}

class UpdateStore {
  appVersion = $state<string>('1.0.0');
  platform = $state<string>('linux');
  arch = $state<string>('x86_64');
  readonly githubPageUrl = 'https://vinello28.github.io/lonestar/';
  readonly githubRepoUrl = `https://github.com/${REPO_SLUG}`;
  readonly githubReleasesUrl = `https://github.com/${REPO_SLUG}/releases`;

  autoUpdateOnStartup = $state<boolean>(true);
  status = $state<UpdateStatus>('idle');
  latestVersion = $state<string | null>(null);
  releaseNotes = $state<string>('');
  downloadUrl = $state<string | null>(null);
  progressPercent = $state<number>(0);
  statusMessage = $state<string>('');
  lastCheckedAt = $state<string | null>(null);

  private pendingUpdate: Update | null = null;

  async initOnStartup(): Promise<void> {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(AUTO_UPDATE_KEY);
      this.autoUpdateOnStartup = saved !== 'false';
    }

    try {
      const info = await backendAdapter.getAppInfo();
      this.appVersion = info.version;
      this.platform = info.platform;
      this.arch = info.arch;
    } catch {
      // Keep defaults
    }

    if (this.autoUpdateOnStartup) {
      await this.checkForUpdates({ silent: true, autoDownload: true });
    }
  }

  setAutoUpdateOnStartup(enabled: boolean): void {
    this.autoUpdateOnStartup = enabled;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_UPDATE_KEY, enabled ? 'true' : 'false');
    }
  }

  async checkForUpdates(
    options: { silent?: boolean; autoDownload?: boolean } = {},
  ): Promise<void> {
    const { silent = false, autoDownload = false } = options;
    if (this.status === 'checking' || this.status === 'downloading') return;

    this.status = 'checking';
    this.progressPercent = 0;
    this.statusMessage = 'Checking GitHub Releases for updates…';

    try {
      if (isTauriRuntime()) {
        try {
          const handled = await this.checkWithTauriUpdater(silent, autoDownload);
          if (handled) return;
        } catch (tauriErr) {
          // If updater endpoint (latest.json) fails or is missing on early releases,
          // fall back to GitHub Releases API check below.
          if (!silent) {
            this.statusMessage = `Updater manifest unavailable (${String(tauriErr)}), checking GitHub Releases…`;
          }
        }
      }

      await this.checkWithGitHubReleasesApi(silent);
    } catch (err) {
      this.lastCheckedAt = new Date().toLocaleTimeString();
      if (silent) {
        this.status = 'idle';
        this.statusMessage = '';
      } else {
        this.status = 'error';
        this.statusMessage = `Update check failed: ${String(err)}`;
        uiStore.notify('Failed to check for updates', 'error');
      }
    }
  }

  private async checkWithTauriUpdater(
    silent: boolean,
    autoDownload: boolean,
  ): Promise<boolean> {
    const { check } = await import('@tauri-apps/plugin-updater');
    if (this.pendingUpdate) {
      await this.pendingUpdate.close().catch(() => {});
      this.pendingUpdate = null;
    }

    const update = await check({ timeout: 12000 });
    this.lastCheckedAt = new Date().toLocaleTimeString();

    if (!update) {
      this.status = 'up-to-date';
      this.latestVersion = this.appVersion;
      this.statusMessage = `LoneStar v${this.appVersion} is up to date.`;
      if (!silent) {
        uiStore.notify(this.statusMessage, 'success');
      }
      return true;
    }

    this.pendingUpdate = update;
    this.latestVersion = update.version;
    this.releaseNotes = update.body ?? '';
    this.downloadUrl = this.githubReleasesUrl;
    this.status = 'available';
    this.statusMessage = `New version v${update.version} available (${this.platform}/${this.arch}).`;

    if (autoDownload) {
      await this.downloadAndInstallPending(silent);
    } else if (!silent) {
      uiStore.notify(`Update v${update.version} available!`, 'info');
    }
    return true;
  }

  private async checkWithGitHubReleasesApi(silent: boolean): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_SLUG}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    this.lastCheckedAt = new Date().toLocaleTimeString();

    if (res.status === 404) {
      this.status = 'up-to-date';
      this.latestVersion = this.appVersion;
      this.statusMessage = `Running v${this.appVersion}. No newer GitHub release published yet.`;
      if (!silent) uiStore.notify(this.statusMessage, 'info');
      return;
    }

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }

    const release = (await res.json()) as {
      tag_name?: string;
      body?: string;
      html_url?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };

    const tag = (release.tag_name ?? '').replace(/^v/i, '').trim();
    if (tag && !isTauriRuntime()) {
      this.appVersion = tag;
    }
    if (!tag || compareSemver(tag, this.appVersion) <= 0) {
      this.status = 'up-to-date';
      this.latestVersion = tag || this.appVersion;
      this.statusMessage = `LoneStar v${this.appVersion} is up to date.`;
      if (!silent) uiStore.notify(this.statusMessage, 'success');
      return;
    }

    const suffixes = matchAssetSuffixes(this.platform, this.arch);
    let matchedUrl = release.html_url ?? this.githubReleasesUrl;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const suffix of suffixes) {
      const found = assets.find((a) =>
        String(a.name ?? '').toLowerCase().endsWith(suffix),
      );
      if (found?.browser_download_url) {
        matchedUrl = found.browser_download_url;
        break;
      }
    }

    this.latestVersion = tag;
    this.releaseNotes = release.body ?? '';
    this.downloadUrl = matchedUrl;
    this.status = 'available';
    this.statusMessage = `LoneStar v${tag} is available for ${this.platform} (${this.arch}).`;
    uiStore.notify(
      `LoneStar v${tag} available — open Settings to download`,
      'info',
    );
  }

  async downloadAndInstallPending(silent = false): Promise<void> {
    if (!this.pendingUpdate) {
      if (this.downloadUrl) {
        await this.openExternalLink(this.downloadUrl);
      }
      return;
    }

    const targetUpdate = this.pendingUpdate;
    this.status = 'downloading';
    this.progressPercent = 0;
    this.statusMessage = `Downloading LoneStar v${targetUpdate.version}…`;

    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
      await targetUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            this.progressPercent = Math.min(
              100,
              Math.round((downloadedBytes / totalBytes) * 100),
            );
          }
        } else if (event.event === 'Finished') {
          this.progressPercent = 100;
        }
      });

      this.status = 'installed';
      this.statusMessage = `Update v${targetUpdate.version} downloaded & installed. Restart LoneStar to apply.`;
      this.pendingUpdate = null;
      uiStore.notify(
        `LoneStar v${targetUpdate.version} ready! Open Settings to restart.`,
        'success',
      );
    } catch (err) {
      if (silent) {
        this.status = 'available';
      } else {
        this.status = 'error';
      }
      this.statusMessage = `Auto-download failed: ${String(err)}. You can download manually from GitHub Releases.`;
      if (!silent) {
        uiStore.notify('Update download failed', 'error');
      }
    }
  }

  async relaunchApp(): Promise<void> {
    if (!isTauriRuntime()) return;
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }

  async openExternalLink(url: string): Promise<void> {
    if (isTauriRuntime()) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
      } catch {
        // Fallback below
      }
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

export const updateStore = new UpdateStore();
