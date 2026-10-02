/**
 * YouTube Music Downloader - Frontend Logic
 * Supports YouTube & YouTube Music songs and playlists
 */

document.addEventListener('DOMContentLoaded', () => {
  const mainForm = document.getElementById('main-form');
  const urlInput = document.getElementById('id_url');
  const btnPaste = document.getElementById('btn-paste');
  const btnClear = document.getElementById('btn-clear');
  const btnDownload = document.getElementById('btn-download');
  const spinner = document.getElementById('spinner');
  const btnText = btnDownload.querySelector('.btn-text');
  const btnArrow = btnDownload.querySelector('.btn-arrow');
  const resultsContainer = document.getElementById('results-container');
  const demoBtns = document.querySelectorAll('.demo-btn');
  const toastContainer = document.getElementById('toast-container');
  const qualitySelect = document.getElementById('quality-select');
  const modeBadge = document.getElementById('download-mode-badge');

  let currentMetadata = null;
  let serverHealth = { ok: false, ytdlp: false, ffmpeg: false, fullDownload: false };

  // Fetch server health on boot
  fetch('/api/health')
    .then((r) => r.json())
    .then((data) => {
      serverHealth = data;
      updateModeBadge();
    })
    .catch(() => {
      serverHealth = { ok: false, ytdlp: false, ffmpeg: false, fullDownload: false };
      updateModeBadge();
    });

  function updateModeBadge() {
    if (!modeBadge) return;
    if (serverHealth.ytdlp && serverHealth.ffmpeg) {
      modeBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Server Ready • High-Quality 320 Kbps MP3 Enabled';
      modeBadge.classList.remove('mode-preview');
      modeBadge.classList.add('mode-full');
    } else if (serverHealth.ytdlp && !serverHealth.ffmpeg) {
      modeBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ffmpeg missing — install ffmpeg for MP3 conversion';
      modeBadge.classList.add('mode-preview');
      modeBadge.classList.remove('mode-full');
    } else {
      modeBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> yt-dlp / ffmpeg not detected on server';
      modeBadge.classList.add('mode-preview');
      modeBadge.classList.remove('mode-full');
    }
  }

  function isValidYouTubeUrl(raw) {
    if (!raw) return false;
    let url = raw.trim().toLowerCase();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    return (
      url.includes('youtube.com/') ||
      url.includes('youtu.be/') ||
      url.includes('music.youtube.com/')
    );
  }

  function cleanUrl(raw) {
    let url = (raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    return url;
  }

  urlInput.addEventListener('input', () => {
    btnClear.classList.toggle('hidden', urlInput.value.trim().length === 0);
  });

  // Handle Ctrl+V or right click paste
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
    urlInput.value = '';
    btnClear.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    currentMetadata = null;
    urlInput.focus();
  });

  // Paste button with auto-process
  btnPaste.addEventListener('click', async () => {
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
      const url = btn.getAttribute('data-url');
      urlInput.value = url;
      btnClear.classList.remove('hidden');
      processUrl(url);
    });
  });

  mainForm.addEventListener('submit', (e) => {
    e.preventDefault();
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

  async function processUrl(url) {
    if (!isValidYouTubeUrl(url)) {
      showToast('Link must be from YouTube or YouTube Music (e.g. youtube.com or youtu.be).', 'error');
      return;
    }

    setLoadingState(true);
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    currentMetadata = null;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze link.');

      currentMetadata = data.metadata;
      setLoadingState(false);

      if (currentMetadata.isPlaylist) {
        renderPlaylistResults(currentMetadata);
        showToast(`Playlist ready — ${currentMetadata.tracks.length} tracks found.`);
      } else {
        renderSingleTrackResult(currentMetadata);
        showToast('Track ready! Click Download MP3 to save.');
      }

      resultsContainer.classList.remove('hidden');
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      setLoadingState(false);
      showToast(err.message || 'Failed to process link.', 'error');
    }
  }

  function setLoadingState(isLoading) {
    spinner.classList.toggle('hidden', !isLoading);
    btnText.textContent = isLoading ? 'Processing...' : 'Download';
    btnArrow.classList.toggle('hidden', isLoading);
    btnDownload.disabled = isLoading;
  }

  function qualityLabel() {
    return qualitySelect ? qualitySelect.value : '320';
  }

  function renderSingleTrackResult(meta) {
    const track = meta.tracks[0] || {
      videoId: '',
      title: meta.title,
      artist: meta.artist,
      duration: meta.duration,
      youtubeUrl: meta.sourceUrl,
    };

    const videoId = track.videoId || track.id || '';
    const youtubeUrl = track.youtubeUrl || meta.sourceUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#');
    const artworkUrl = meta.artworkUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

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
            <p class="media-artist">${escapeHtml(meta.artist)}${meta.album ? ' • ' + escapeHtml(meta.album) : ''}</p>
            <div class="media-meta">
              <span><i class="fa-regular fa-clock"></i> ${meta.duration || '0:00'}</span>
              <span><i class="fa-solid fa-headphones"></i> MP3 (${qualityLabel()} Kbps)</span>
            </div>

            <!-- Preview Toggle -->
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
              <button type="button" class="btn-download-sm download-trigger" data-video-id="${escapeHtml(videoId)}" data-url="${escapeHtml(youtubeUrl)}" data-title="${escapeHtml(meta.title)}" data-artist="${escapeHtml(meta.artist)}">
                <i class="fa-solid fa-download"></i> <span>Download MP3</span>
              </button>
              ${artworkUrl ? `
                <a href="${escapeHtml(artworkUrl)}" target="_blank" rel="noopener" class="btn-download-sm btn-artwork">
                  <i class="fa-solid fa-image"></i> Artwork
                </a>
              ` : ''}
              <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener" class="btn-download-sm btn-watch">
                <i class="fa-brands fa-youtube"></i> YouTube
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    // Preview player toggle
    const previewBtn = document.getElementById('btn-preview-toggle');
    const previewWrap = document.getElementById('preview-player-wrap');
    const previewIframe = document.getElementById('preview-iframe');

    if (previewBtn && previewWrap && previewIframe) {
      previewBtn.addEventListener('click', () => {
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

    attachDownloadEvents();
  }

  function renderPlaylistResults(meta) {
    const tracksList = meta.tracks || [];

    resultsContainer.innerHTML = `
      <div class="result-card">
        <div class="media-header">
          <div class="album-art-wrap">
            <img src="${escapeHtml(meta.artworkUrl)}" alt="${escapeHtml(meta.title)}" onerror="this.src='https://placehold.co/140x140/1a1a1a/ffffff?text=Playlist'">
            <span class="quality-badge">${tracksList.length} TRACKS</span>
          </div>
          <div class="media-details">
            <span class="media-type-tag"><i class="fa-solid fa-layer-group"></i> YouTube Playlist / Album</span>
            <h2 class="media-title">${escapeHtml(meta.title)}</h2>
            <p class="media-artist">${escapeHtml(meta.artist)} • ${tracksList.length} tracks</p>
          </div>
        </div>

        <div class="batch-download-bar">
          <div>
            <strong>Download all tracks as ZIP</strong>
            <p class="batch-hint">Saves all ${tracksList.length} tracks as high quality MP3 (${qualityLabel()} Kbps) in a single ZIP file.</p>
          </div>
          <button type="button" class="btn-zip" id="btn-zip-all">
            <i class="fa-solid fa-file-zipper"></i> <span id="zip-btn-text">ZIP Download All</span>
          </button>
        </div>

        <div class="track-list">
          ${tracksList.map((t) => renderTrackItem(t)).join('')}
        </div>
      </div>
    `;

    attachDownloadEvents();
    const zipBtn = document.getElementById('btn-zip-all');
    if (zipBtn) zipBtn.addEventListener('click', downloadZip);
  }

  function renderTrackItem(t) {
    const videoId = t.videoId || t.id || '';
    const youtubeUrl = t.youtubeUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');

    return `
      <div class="track-item">
        <div class="track-info">
          <span class="track-num">${t.num}.</span>
          <div>
            <div class="track-name">${escapeHtml(t.title)}</div>
            <div class="track-sub">${escapeHtml(t.artist)} • ${t.duration || '0:00'}</div>
          </div>
        </div>
        <button type="button" class="btn-download-sm download-trigger" data-video-id="${escapeHtml(videoId)}" data-url="${escapeHtml(youtubeUrl)}" data-title="${escapeHtml(t.title)}" data-artist="${escapeHtml(t.artist)}">
          <i class="fa-solid fa-download"></i> <span>MP3</span>
        </button>
      </div>
    `;
  }

  function attachDownloadEvents() {
    resultsContainer.querySelectorAll('.download-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const videoId = btn.getAttribute('data-video-id');
        const url = btn.getAttribute('data-url');
        const title = btn.getAttribute('data-title');
        const artist = btn.getAttribute('data-artist');
        downloadTrack({ videoId, url, title, artist, btn });
      });
    });
  }

  async function downloadTrack({ videoId, url, title, artist, btn }) {
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Converting...';
    }

    showToast(`Converting & downloading "${title || 'Track'}" as MP3...`, 'info');

    const params = new URLSearchParams();
    if (url) params.set('url', url);
    if (videoId) params.set('videoId', videoId);
    if (qualitySelect) params.set('bitrate', qualitySelect.value);

    try {
      const res = await fetch(`/api/download?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Download failed on server.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = '';

      const matchUtf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const matchAscii = disposition.match(/filename="([^"]+)"/i);

      if (matchUtf8) {
        filename = decodeURIComponent(matchUtf8[1]);
      } else if (matchAscii) {
        filename = decodeURIComponent(matchAscii[1]);
      } else {
        const safeArtist = (artist || '').replace(/[\\/:*?"<>|]/g, '');
        const safeTitle = (title || 'Track').replace(/[\\/:*?"<>|]/g, '');
        filename = safeArtist ? `${safeArtist} - ${safeTitle}.mp3` : `${safeTitle}.mp3`;
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60000);

      showToast(`Saved: ${filename}`, 'success');
    } catch (err) {
      showToast(err.message || 'Download failed.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function downloadZip() {
    if (!currentMetadata?.tracks?.length) return;

    const zipBtn = document.getElementById('btn-zip-all');
    const zipBtnText = document.getElementById('zip-btn-text');
    const originalText = zipBtnText ? zipBtnText.textContent : 'ZIP Download All';

    if (zipBtn) zipBtn.disabled = true;
    if (zipBtnText) zipBtnText.textContent = 'Building ZIP (please wait)...';

    showToast(`Processing ${currentMetadata.tracks.length} tracks into ZIP...`, 'info');

    try {
      const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zipName: `${currentMetadata.artist} - ${currentMetadata.title}`,
          tracks: currentMetadata.tracks,
          bitrate: qualitySelect ? qualitySelect.value : '320',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ZIP creation failed.');
      }

      const blob = await res.blob();
      const included = res.headers.get('X-Tracks-Included') || String(currentMetadata.tracks.length);
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = `${currentMetadata.title || 'YouTube-Playlist'}.zip`;

      const matchUtf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const matchAscii = disposition.match(/filename="([^"]+)"/i);
      if (matchUtf8) {
        filename = decodeURIComponent(matchUtf8[1]);
      } else if (matchAscii) {
        filename = decodeURIComponent(matchAscii[1]);
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60000);

      showToast(`ZIP saved successfully (${included} tracks included)!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download ZIP.', 'error');
    } finally {
      if (zipBtn) zipBtn.disabled = false;
      if (zipBtnText) zipBtnText.textContent = originalText;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    })[m]);
  }

  document.querySelectorAll('.accordion-item').forEach((item) => {
    item.querySelector('.accordion-header').addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.accordion-item').forEach((i) => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon =
      type === 'error' ? 'fa-circle-xmark' : type === 'info' ? 'fa-circle-info' : 'fa-circle-check';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
});
