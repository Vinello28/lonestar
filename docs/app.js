(function () {
  const themeBtn = document.getElementById('theme-toggle');
  const root = document.documentElement;

  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    if (themeBtn) {
      themeBtn.textContent = mode === 'dark' ? '☀ Light Mode' : '☾ Dark Mode';
    }
    try {
      window.localStorage.setItem('lonestar-docs-theme', mode);
    } catch {
      // Ignore storage restrictions
    }
  }

  const savedTheme = (() => {
    try {
      return window.localStorage.getItem('lonestar-docs-theme');
    } catch {
      return null;
    }
  })();

  applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

  themeBtn?.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Detect OS to highlight the matching download card & primary CTA
  const ua = navigator.userAgent.toLowerCase();
  let detectedOs = 'linux';
  let osDisplay = 'Linux';
  let preferredMatcher = '.AppImage';

  if (ua.includes('win')) {
    detectedOs = 'windows';
    osDisplay = 'Windows';
    preferredMatcher = '.msi';
  } else if (ua.includes('mac') || ua.includes('darwin')) {
    detectedOs = 'macos';
    osDisplay = 'macOS';
    preferredMatcher = 'aarch64.dmg';
  }

  document.querySelectorAll('.card[data-os]').forEach((card) => {
    if (card.getAttribute('data-os') === detectedOs) {
      card.classList.add('highlighted');
    }
  });

  const primaryBtn = document.getElementById('primary-download-btn');
  const detectedNote = document.getElementById('os-detected-note');
  if (primaryBtn) {
    primaryBtn.textContent = `Download for ${osDisplay}`;
  }
  if (detectedNote) {
    detectedNote.textContent = `Detected ${osDisplay} — native Tauri v2 desktop package ready below, or launch directly in your browser.`;
  }

  // Infer GitHub owner/repo automatically when hosted on GitHub Pages (<owner>.github.io/<repo>/)
  function inferGitHubRepo() {
    const host = window.location.hostname;
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (host.endsWith('.github.io') && parts.length > 0) {
      const owner = host.replace('.github.io', '');
      return `${owner}/${parts[0]}`;
    }
    return 'lonestar-istar/lonestar';
  }

  const repoSlug = inferGitHubRepo();
  const releasesBase = `https://github.com/${repoSlug}/releases`;
  const releasesLink = document.getElementById('repo-releases-link');
  if (releasesLink) {
    releasesLink.setAttribute('href', releasesBase);
  }

  // Set sensible release fallback links immediately
  document.querySelectorAll('.dl-link').forEach((anchor) => {
    anchor.setAttribute('href', `${releasesBase}/latest`);
  });

  // Query GitHub Releases API to wire exact binary asset URLs when published
  fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`)
    .then((res) => (res.ok ? res.json() : null))
    .then((release) => {
      if (!release || !Array.isArray(release.assets)) return;
      const versionLabel = document.getElementById('release-version-label');
      if (versionLabel && release.tag_name) {
        versionLabel.textContent = `Latest release ${release.tag_name} — native installers built by GitHub Actions.`;
      }

      document.querySelectorAll('.dl-link').forEach((anchor) => {
        const suffix = anchor.getAttribute('data-asset-match');
        if (!suffix) return;
        const asset = release.assets.find((a) =>
          String(a.name).toLowerCase().endsWith(suffix.toLowerCase()),
        );
        if (asset && asset.browser_download_url) {
          anchor.setAttribute('href', asset.browser_download_url);
          if (suffix === preferredMatcher && primaryBtn) {
            primaryBtn.setAttribute('href', asset.browser_download_url);
          }
        }
      });
    })
    .catch(() => {
      // Offline or rate-limited: fallback links already point to /releases/latest
    });
})();
