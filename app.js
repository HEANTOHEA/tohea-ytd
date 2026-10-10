/**
 * YouTube Music Downloader — Approach B (Cloud Backend & Telegram Mini App)
 * Connects frontend to private backend server (Render / Railway / Localhost)
 * Supports direct in-app MP3 downloads, playlist ZIPs, and Telegram WebApp SDK.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Telegram WebApp SDK if running inside Telegram
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    } catch (_) {}
  }

  // Core DOM Elements
  const mainForm = document.getElementById('main-form');
  const urlInput = document.getElementById('id_url');
  const btnPaste = document.getElementById('btn-paste');
  const btnClear = document.getElementById('btn-clear');
  const btnDownload = document.getElementById('btn-download');
  const spinner = document.getElementById('spinner');
  const btnText = btnDownload ? btnDownload.querySelector('.btn-text') : null;
  const btnArrow = btnDownload ? btnDownload.querySelector('.btn-arrow') : null;
  const resultsContainer = document.getElementById('results-container');
  const demoBtns = document.querySelectorAll('.demo-btn');
  const toastContainer = document.getElementById('toast-container');
  const qualitySelect = document.getElementById('quality-select');

  // Backend Connection Elements
  const backendStatusPill = document.getElementById('backend-status-pill');
  const backendStatusText = document.getElementById('backend-status-text');
  const serverStatusLabel = document.getElementById('server-status-label');
  const btnOpenServer = document.getElementById('btn-open-server-settings');
  const serverModal = document.getElementById('server-modal');
  const btnCloseServer = document.getElementById('btn-close-server');
  const btnCancelServer = document.getElementById('btn-cancel-server');
  const btnSaveServer = document.getElementById('btn-save-server');
  const backendUrlInput = document.getElementById('backend-url-input');
  const btnTestBackend = document.getElementById('btn-test-backend');
  const backendTestResult = document.getElementById('backend-test-result');
  const cookiesTextarea = document.getElementById('cookies-textarea');
  const btnSaveCookies = document.getElementById('btn-save-cookies');

  // Telegram Modal Elements
  const btnOpenTelegram = document.getElementById('btn-open-telegram-guide');
  const telegramModal = document.getElementById('telegram-modal');
  const btnCloseTelegram = document.getElementById('btn-close-telegram');
  const btnDismissTelegram = document.getElementById('btn-dismiss-telegram');

  let currentMetadata = null;
  let isBackendOnline = false;

  /* ────────────────────── Telegram WebApp Helpers ────────────────────── */

  function triggerHaptic(type = 'light') {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch (_) {}
  }

  function openExternalLink(url) {
    triggerHaptic('medium');
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /* ────────────────────── Backend URL Config ────────────────────── */

  function getBackendUrl() {
    const saved = localStorage.getItem('ytdl_backend_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    // If hosted on http/https and NOT on GitHub Pages, use current origin
    if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io')) {
      return window.location.origin;
    }
    // Default fallback (e.g. for local dev or static preview)
    return 'http://localhost:3000';
  }

  function setBackendUrl(url) {
    if (url) {
      localStorage.setItem('ytdl_backend_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('ytdl_backend_url');
    }
  }

  async function checkBackendHealth() {
    const baseUrl = getBackendUrl();
    try {
      const res = await fetch(`${baseUrl}/api/health`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        isBackendOnline = true;
        updateBackendStatusUI(true, data);
        return { ok: true, data };
      }
    } catch (_) {}

    isBackendOnline = false;
    updateBackendStatusUI(false);
    return { ok: false };
  }

  function updateBackendStatusUI(online, healthData = null) {
    if (online) {
      if (backendStatusPill) {
        backendStatusPill.className = 'download-mode-badge mode-full';
        backendStatusPill.style.background = 'rgba(37, 211, 102, 0.15)';
        backendStatusPill.style.borderColor = 'rgba(37, 211, 102, 0.4)';
        backendStatusPill.style.color = '#25d366';
      }
      if (backendStatusText) {
        backendStatusText.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected to Cloud Backend (${getBackendUrl()}) • Direct MP3 Ready`;
      }
      if (serverStatusLabel) {
        serverStatusLabel.innerHTML = `<span style="color:#25d366;">●</span> API Online`;
      }
    } else {
      if (backendStatusPill) {
        backendStatusPill.className = 'download-mode-badge mode-full';
        backendStatusPill.style.background = 'rgba(255, 183, 3, 0.12)';
        backendStatusPill.style.borderColor = 'rgba(255, 183, 3, 0.35)';
        backendStatusPill.style.color = '#ffb703';
      }
      if (backendStatusText) {
        backendStatusText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Backend Not Connected • Tap 'Backend API' to link your server`;
      }
      if (serverStatusLabel) {
        serverStatusLabel.innerHTML = `<span style="color:#ffb703;">○</span> Connect API`;
      }
    }
  }

  // Initial health check on page load
  checkBackendHealth();

  /* ────────────────────── Backend Settings Modal ────────────────────── */

  function openServerModal() {
    triggerHaptic('light');
    if (backendUrlInput) backendUrlInput.value = getBackendUrl();
    if (backendTestResult) backendTestResult.textContent = '';
    if (serverModal) serverModal.classList.remove('hidden');
  }

  function closeServerModal() {
    triggerHaptic('light');
    if (serverModal) serverModal.classList.add('hidden');
  }

  if (btnOpenServer) btnOpenServer.addEventListener('click', openServerModal);
  if (btnCloseServer) btnCloseServer.addEventListener('click', closeServerModal);
  if (btnCancelServer) btnCancelServer.addEventListener('click', closeServerModal);
  if (serverModal) {
    serverModal.addEventListener('click', (e) => {
      if (e.target === serverModal) closeServerModal();
    });
  }

  if (btnTestBackend) {
    btnTestBackend.addEventListener('click', async () => {
      triggerHaptic('medium');
      const testUrl = (backendUrlInput?.value || '').trim().replace(/\/+$/, '');
      if (!testUrl) {
        if (backendTestResult) backendTestResult.innerHTML = '<span style="color:#ff4444;">Please enter a URL.</span>';
        return;
      }

      if (backendTestResult) backendTestResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing connection...';

      try {
        const res = await fetch(`${testUrl}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (backendTestResult) {
            backendTestResult.innerHTML = `<span style="color:#25d366;"><i class="fa-solid fa-check"></i> Connected! yt-dlp: ${data.ytdlp ? '✓' : '✗'}, ffmpeg: ${data.ffmpeg ? '✓' : '✗'}</span>`;
          }
        } else {
          if (backendTestResult) backendTestResult.innerHTML = `<span style="color:#ff4444;"><i class="fa-solid fa-xmark"></i> Server returned HTTP ${res.status}</span>`;
        }
      } catch (err) {
        if (backendTestResult) backendTestResult.innerHTML = `<span style="color:#ff4444;"><i class="fa-solid fa-xmark"></i> Failed to connect. Check URL or CORS.</span>`;
      }
    });
  }

  if (btnSaveServer) {
    btnSaveServer.addEventListener('click', async () => {
      triggerHaptic('medium');
      const newUrl = (backendUrlInput?.value || '').trim();
      setBackendUrl(newUrl);
      closeServerModal();
      showToast('Backend URL saved. Testing connection...', 'info');
      await checkBackendHealth();
      if (isBackendOnline) {
        showToast('Successfully connected to Backend API!', 'success');
      } else {
        showToast('Saved, but backend appears offline. Verify server is running.', 'info');
      }
    });
  }

  if (btnSaveCookies) {
    btnSaveCookies.addEventListener('click', async () => {
      const cookies = (cookiesTextarea?.value || '').trim();
      if (!cookies) {
        showToast('Please paste your cookies text first.', 'error');
        return;
      }
      try {
        const baseUrl = getBackendUrl();
        const res = await fetch(`${baseUrl}/api/cookies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies }),
        });
        if (res.ok) {
          showToast('YouTube cookies saved to backend!', 'success');
          cookiesTextarea.value = '';
        } else {
          showToast('Failed to save cookies on backend.', 'error');
        }
      } catch (err) {
        showToast('Could not reach backend to save cookies.', 'error');
      }
    });
  }

  /* ────────────────────── Telegram Modal ────────────────────── */

  function openTelegramModal() {
    triggerHaptic('light');
    if (telegramModal) telegramModal.classList.remove('hidden');
  }

  function closeTelegramModal() {
    triggerHaptic('light');
    if (telegramModal) telegramModal.classList.add('hidden');
  }

  if (btnOpenTelegram) btnOpenTelegram.addEventListener('click', openTelegramModal);
  if (btnCloseTelegram) btnCloseTelegram.addEventListener('click', closeTelegramModal);
  if (btnDismissTelegram) btnDismissTelegram.addEventListener('click', closeTelegramModal);
  if (telegramModal) {
    telegramModal.addEventListener('click', (e) => {
      if (e.target === telegramModal) closeTelegramModal();
    });
  }

  /* ────────────────────── URL Utilities ────────────────────── */

  function isValidYouTubeUrl(raw) {
    if (!raw) return false;
    let url = raw.trim().toLowerCase();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return (
      url.includes('youtube.com/') ||
      url.includes('youtu.be/') ||
      url.includes('music.youtube.com/')
    );
  }

  function cleanUrl(raw) {
    let url = (raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function extractVideoId(url) {
    if (!url) return null;
    const clean = cleanUrl(url);

    let match = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/i);
    if (match) return match[1];

    match = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
    if (match) return match[1];

    match = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    if (match) return match[1];

    match = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (match) return match[1];

    return null;
  }

  /* ────────────────────── Metadata & Analysis Fetcher ────────────────────── */

  async function analyzeUrl(url) {
    const baseUrl = getBackendUrl();

    // 1. If backend is online, use backend /api/analyze (supports single videos & full playlists!)
    if (isBackendOnline) {
      try {
        const res = await fetch(`${baseUrl}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.metadata) {
            return data.metadata;
          }
        }
      } catch (_) {}
    }

    // 2. Client-side fallback via noembed if backend is offline
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Please enter a valid YouTube or YouTube Music link.');
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const hqArtwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          return {
            isPlaylist: false,
            title: data.title || 'YouTube Track',
            artist: data.author_name || 'YouTube Creator',
            artworkUrl: hqArtwork,
            videoId: videoId,
            sourceUrl: canonicalUrl,
            tracks: [
              {
                id: videoId,
                videoId: videoId,
                num: 1,
                title: data.title || 'YouTube Track',
                artist: data.author_name || 'YouTube Creator',
                artworkUrl: hqArtwork,
                youtubeUrl: canonicalUrl,
              },
            ],
          };
        }
      }
    } catch (_) {}

    return {
      isPlaylist: false,
      title: 'YouTube Music Track',
      artist: 'YouTube Audio',
      artworkUrl: hqArtwork,
      videoId: videoId,
      sourceUrl: canonicalUrl,
      tracks: [
        {
          id: videoId,
          videoId: videoId,
          num: 1,
          title: 'YouTube Track',
          artist: 'YouTube Creator',
          artworkUrl: hqArtwork,
          youtubeUrl: canonicalUrl,
        },
      ],
    };
  }

  /* ────────────────────── UI Event Handlers ────────────────────── */

  urlInput.addEventListener('input', () => {
    btnClear.classList.toggle('hidden', urlInput.value.trim().length === 0);
  });

  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      btnClear.classList.remove('hidden');
      const val = cleanUrl(urlInput.value);
      if (isValidYouTubeUrl(val)) {
        processUrl(val);
      }
    }, 80);
  });

  btnClear.addEventListener('click', () => {
    triggerHaptic('light');
    urlInput.value = '';
    btnClear.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    currentMetadata = null;
    urlInput.focus();
  });

  btnPaste.addEventListener('click', async () => {
    triggerHaptic('light');
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = cleanUrl(text);
      if (trimmed) {
        urlInput.value = trimmed;
        btnClear.classList.remove('hidden');
        showToast('Link pasted from clipboard!');
        if (isValidYouTubeUrl(trimmed)) {
          processUrl(trimmed);
        } else {
          showToast('Pasted text is not a valid YouTube or YouTube Music link.', 'error');
        }
      } else {
        showToast('Clipboard is empty. Copy a YouTube link first.', 'info');
      }
    } catch (_) {
      showToast('Please paste the link manually into the box (Ctrl+V).', 'info');
      urlInput.focus();
    }
  });

  demoBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerHaptic('medium');
      const url = btn.getAttribute('data-url');
      urlInput.value = url;
      btnClear.classList.remove('hidden');
      processUrl(url);
    });
  });

  mainForm.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerHaptic('medium');
    const url = cleanUrl(urlInput.value);
    if (!url) {
      showToast('Please enter a YouTube or YouTube Music link.', 'error');
      urlInput.focus();
      return;
    }
    if (!isValidYouTubeUrl(url)) {
      showToast('Please enter a valid YouTube or YouTube Music link.', 'error');
      return;
    }
    processUrl(url);
  });

  /* ────────────────────── Process URL ────────────────────── */

  async function processUrl(url) {
    if (!isValidYouTubeUrl(url)) {
      showToast('Link must be from YouTube or YouTube Music.', 'error');
      return;
    }

    setLoadingState(true);
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    currentMetadata = null;

    try {
      const meta = await analyzeUrl(url);
      currentMetadata = meta;
      setLoadingState(false);
      renderResults(meta);

      if (isBackendOnline) {
        showToast('Ready! Click "Direct MP3" to download from your cloud backend.', 'success');
      } else {
        showToast('Track loaded! Click "Backend API" to connect your server for direct MP3s.', 'info');
      }

      resultsContainer.classList.remove('hidden');
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      setLoadingState(false);
      showToast(err.message || 'Failed to process link.', 'error');
    }
  }

  function setLoadingState(isLoading) {
    if (spinner) spinner.classList.toggle('hidden', !isLoading);
    if (btnText) btnText.textContent = isLoading ? 'Processing...' : 'Download';
    if (btnArrow) btnArrow.classList.toggle('hidden', isLoading);
    if (btnDownload) btnDownload.disabled = isLoading;
  }

  function qualityLabel() {
    return qualitySelect ? qualitySelect.value : '320';
  }

  /* ────────────────────── Render Track / Playlist ────────────────────── */

  function renderResults(meta) {
    const isPlaylist = Boolean(meta.isPlaylist);
    const videoId = meta.videoId || (meta.tracks && meta.tracks[0]?.videoId) || '';
    const youtubeUrl = meta.sourceUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#');
    const artworkUrl = meta.artworkUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

    // Direct download endpoint on our cloud backend
    const bitrate = qualityLabel();
    const backendBase = getBackendUrl();
    const directDownloadUrl = `${backendBase}/api/download?url=${encodeURIComponent(youtubeUrl)}&bitrate=${bitrate}`;

    if (isPlaylist) {
      // Playlist Rendering
      const tracksHtml = (meta.tracks || []).map((t) => `
        <div class="track-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
            <span style="font-size: 0.85rem; color: var(--text-dim); min-width: 22px;">#${t.num}</span>
            <img src="${escapeHtml(t.artworkUrl)}" alt="${escapeHtml(t.title)}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <h4 style="font-size: 0.92rem; margin: 0; color: #fff; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(t.title)}</h4>
              <p style="font-size: 0.8rem; margin: 0; color: var(--text-muted);">${escapeHtml(t.artist)} • ${t.duration || ''}</p>
            </div>
          </div>
          <button type="button" class="btn-download-sm btn-server-1 download-single-btn" data-url="${escapeHtml(t.youtubeUrl)}" data-title="${escapeHtml(t.title)}" data-artist="${escapeHtml(t.artist)}">
            <i class="fa-solid fa-download"></i> MP3
          </button>
        </div>
      `).join('');

      resultsContainer.innerHTML = `
        <div class="result-card">
          <div class="media-header">
            <div class="album-art-wrap">
              <img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(meta.title)}">
              <span class="quality-badge">${meta.trackCount || meta.tracks.length} TRACKS</span>
            </div>
            <div class="media-details">
              <span class="media-type-tag"><i class="fa-solid fa-list-ul"></i> YouTube Playlist</span>
              <h2 class="media-title">${escapeHtml(meta.title)}</h2>
              <p class="media-artist">${escapeHtml(meta.artist)}</p>
              <div class="media-meta">
                <span><i class="fa-solid fa-music"></i> ${meta.tracks.length} Songs</span>
                <span><i class="fa-solid fa-headphones"></i> ${qualityLabel()} Kbps MP3</span>
              </div>

              <div class="download-actions" style="margin-top: 1rem;">
                <button type="button" class="btn-download-sm btn-server-1" id="btn-download-zip" style="font-size: 0.95rem; padding: 10px 18px;">
                  <i class="fa-solid fa-file-zipper"></i> <span>Download Full Playlist (ZIP)</span>
                </button>
              </div>
            </div>
          </div>

          <div class="playlist-tracks" style="margin-top: 1.5rem; max-height: 400px; overflow-y: auto; padding-right: 6px;">
            <h3 style="font-size: 1rem; margin-bottom: 12px; color: var(--text-muted);">Playlist Tracks:</h3>
            ${tracksHtml}
          </div>
        </div>
      `;

      // Playlist ZIP Handler
      const zipBtn = document.getElementById('btn-download-zip');
      if (zipBtn) {
        zipBtn.addEventListener('click', () => {
          downloadPlaylistZip(meta.tracks, meta.title, zipBtn);
        });
      }

      // Individual Track Download Handlers
      resultsContainer.querySelectorAll('.download-single-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = btn.getAttribute('data-url');
          const title = btn.getAttribute('data-title');
          const artist = btn.getAttribute('data-artist');
          downloadTrackDirect({ url, title, artist, btn, bitrate });
        });
      });

      return;
    }

    // Single Track Rendering
    resultsContainer.innerHTML = `
      <div class="result-card">
        <div class="media-header">
          <div class="album-art-wrap">
            <img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(meta.title)}" onerror="this.src='https://placehold.co/140x140/1a1a1a/ffffff?text=Music'">
            <span class="quality-badge">${qualityLabel()} KBPS</span>
          </div>
          <div class="media-details">
            <span class="media-type-tag"><i class="fa-brands fa-youtube"></i> YouTube Music Track</span>
            <h2 class="media-title">${escapeHtml(meta.title)}</h2>
            <p class="media-artist">${escapeHtml(meta.artist)}</p>
            <div class="media-meta">
              <span><i class="fa-solid fa-headphones"></i> MP3 (${qualityLabel()} Kbps)</span>
              <span><i class="fa-brands fa-telegram"></i> Telegram Mini App Ready</span>
            </div>

            ${videoId ? `
              <div class="preview-box">
                <button type="button" class="btn-preview-toggle" id="btn-preview-toggle">
                  <i class="fa-solid fa-play"></i> <span>Listen Preview</span>
                </button>
                <div class="preview-player-container hidden" id="preview-player-wrap">
                  <iframe 
                    id="preview-iframe" 
                    width="100%" 
                    height="120" 
                    src="" 
                    data-src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1"
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                  </iframe>
                </div>
              </div>
            ` : ''}

            <div class="download-actions">
              <button type="button" class="btn-download-sm btn-server-1" id="btn-direct-download" data-url="${escapeHtml(youtubeUrl)}" data-title="${escapeHtml(meta.title)}" data-artist="${escapeHtml(meta.artist)}" title="Direct MP3 download from your cloud backend">
                <i class="fa-solid fa-download"></i> <span>Download MP3 (Direct ${qualityLabel()}K)</span>
              </button>
              ${artworkUrl ? `
                <button type="button" class="btn-download-sm btn-artwork" data-action="link" data-url="${escapeHtml(artworkUrl)}" title="View Artwork">
                  <i class="fa-solid fa-image"></i> Artwork
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // Preview Player Toggle
    const previewBtn = document.getElementById('btn-preview-toggle');
    const previewWrap = document.getElementById('preview-player-wrap');
    const previewIframe = document.getElementById('preview-iframe');

    if (previewBtn && previewWrap && previewIframe) {
      previewBtn.addEventListener('click', () => {
        triggerHaptic('light');
        const isHidden = previewWrap.classList.contains('hidden');
        if (isHidden) {
          previewIframe.src = previewIframe.getAttribute('data-src');
          previewWrap.classList.remove('hidden');
          previewBtn.innerHTML = '<i class="fa-solid fa-stop"></i> <span>Close Preview</span>';
        } else {
          previewIframe.src = '';
          previewWrap.classList.add('hidden');
          previewBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Listen Preview</span>';
        }
      });
    }

    // Direct Download Handler (Primary Approach B Action)
    const directBtn = document.getElementById('btn-direct-download');
    if (directBtn) {
      directBtn.addEventListener('click', () => {
        downloadTrackDirect({
          url: youtubeUrl,
          videoId: videoId,
          title: meta.title,
          artist: meta.artist,
          btn: directBtn,
          bitrate: bitrate,
        });
      });
    }

    // Secondary Web Fallbacks
    resultsContainer.querySelectorAll('[data-action="link"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetUrl = btn.getAttribute('data-url');
        if (targetUrl) {
          openExternalLink(targetUrl);
          showToast('Opening link...', 'info');
        }
      });
    });
  }

  /* ────────────────────── Direct Download via Cloud Backend ────────────────────── */

  async function downloadTrackDirect({ url, videoId, title, artist, btn, bitrate }) {
    triggerHaptic('medium');

    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Converting & Downloading...';
    }

    const baseUrl = getBackendUrl();
    const downloadEndpoint = `${baseUrl}/api/download?url=${encodeURIComponent(url)}&bitrate=${bitrate || '320'}`;

    showToast(`Converting "${title || 'Track'}" on backend... please wait.`, 'info');

    try {
      const response = await fetch(downloadEndpoint);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Download failed with HTTP ${response.status}`);
      }

      // Extract filename from Content-Disposition header if available
      let filename = `${(artist || 'Artist').replace(/[\\/:*?"<>|]/g, '')} - ${(title || 'Song').replace(/[\\/:*?"<>|]/g, '')}.mp3`;
      const disposition = response.headers.get('Content-Disposition');
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        if (match) {
          filename = decodeURIComponent(match[1] || match[2]);
        }
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Trigger instant download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blobUrl);
      }, 30000);

      triggerHaptic('success');
      showToast(`Saved: ${filename}`, 'success');
    } catch (err) {
      triggerHaptic('error');
      showToast(err.message || 'Backend download failed.', 'error');

      // If backend is unreachable, offer to configure
      if (!isBackendOnline) {
        setTimeout(() => openServerModal(), 1200);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function downloadPlaylistZip(tracks, playlistTitle, btn) {
    triggerHaptic('medium');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Packaging Playlist ZIP...';

    const baseUrl = getBackendUrl();
    const zipEndpoint = `${baseUrl}/api/download-zip`;
    const bitrate = qualityLabel();

    showToast(`Converting all ${tracks.length} tracks into ZIP... this may take 1-2 minutes.`, 'info');

    try {
      const response = await fetch(zipEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks,
          bitrate,
          zipName: playlistTitle || 'YouTube-Playlist',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `ZIP creation failed (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const safeTitle = (playlistTitle || 'YouTube-Playlist').replace(/[\\/:*?"<>|]/g, '');

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${safeTitle}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blobUrl);
      }, 30000);

      triggerHaptic('success');
      showToast(`Playlist ZIP saved!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed generating ZIP archive.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  /* ────────────────────── Utility Functions ────────────────────── */

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '&gt;': '>',
      '"': '&quot;',
      "'": '&#039;',
    })[m]);
  }

  // Accordion FAQ Toggle
  document.querySelectorAll('.accordion-item').forEach((item) => {
    const header = item.querySelector('.accordion-header');
    if (header) {
      header.addEventListener('click', () => {
        triggerHaptic('light');
        const isActive = item.classList.contains('active');
        document.querySelectorAll('.accordion-item').forEach((el) => el.classList.remove('active'));
        if (!isActive) item.classList.add('active');
      });
    }
  });

  // Toast Notification System
  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
});
