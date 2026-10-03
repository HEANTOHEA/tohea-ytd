/**
 * YouTube Music Downloader — local server
 * Serves the site and resolves downloads via yt-dlp + ffmpeg.
 */

const express = require('express');
const cors = require('cors');
const JSZip = require('jszip');
const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

// Support cookies passed via environment variable (useful on cloud hosts like Render/Railway)
if (process.env.YT_COOKIES_CONTENT) {
  try {
    const cookiesFile = path.join(os.tmpdir(), 'yt-cookies.txt');
    fs.writeFileSync(cookiesFile, process.env.YT_COOKIES_CONTENT, 'utf8');
    process.env.YT_COOKIES_PATH = cookiesFile;
  } catch (_) {}
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// Enable CORS with exposed headers for download filenames and progress
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Content-Disposition', 'X-Tracks-Included', 'X-Download-Source'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

function getFfmpegPath() {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch (_) {}
  return null;
}

// Register candidate directories to PATH
const candidateDirs = [path.join(__dirname, 'bin')];
const staticFfmpegBinary = getFfmpegPath();
if (staticFfmpegBinary) {
  candidateDirs.unshift(path.dirname(staticFfmpegBinary));
}

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const pythonBase = path.join(appData, 'Python');

if (fs.existsSync(pythonBase)) {
  try {
    for (const pyVer of fs.readdirSync(pythonBase)) {
      candidateDirs.push(path.join(pythonBase, pyVer, 'Scripts'));
      candidateDirs.push(path.join(pythonBase, pyVer, 'site-packages', 'static_ffmpeg', 'bin', 'win32'));
    }
  } catch (_) {}
}

candidateDirs.push(path.join(appData, 'Python', 'Python313', 'Scripts'));
candidateDirs.push(path.join(appData, 'Python', 'Python313', 'site-packages', 'static_ffmpeg', 'bin', 'win32'));
candidateDirs.push('C:\\Python313\\Scripts');
candidateDirs.push('C:\\Python313');
candidateDirs.push('C:\\ffmpeg\\bin');

for (const dir of candidateDirs) {
  if (fs.existsSync(dir) && !process.env.PATH.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  }
}

function getYtdlpExecutable() {
  const localBin = path.join(__dirname, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return 'yt-dlp';
}

function isYtdlpAvailable() {
  const exec = getYtdlpExecutable();
  try {
    execSync(`"${exec}" --version`, { stdio: 'pipe' });
    return true;
  } catch (_) {
    try {
      execSync('yt-dlp --version', { stdio: 'pipe' });
      return true;
    } catch (_) {
      try {
        execSync('python3 -m yt_dlp --version', { stdio: 'pipe' });
        return true;
      } catch (_) {
        try {
          execSync('python -m yt_dlp --version', { stdio: 'pipe' });
          return true;
        } catch (_) {
          return false;
        }
      }
    }
  }
}

function isFfmpegAvailable() {
  if (getFfmpegPath()) return true;
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

// Automatically install yt-dlp on launch if missing
if (!isYtdlpAvailable()) {
  try {
    console.log('[server] yt-dlp not detected. Attempting automated installation via scripts/install-ytdlp.js...');
    const installScript = path.join(__dirname, 'scripts', 'install-ytdlp.js');
    if (fs.existsSync(installScript)) {
      execSync(`node "${installScript}"`, { stdio: 'inherit' });
    }
  } catch (err) {
    console.warn('[server] Auto-install yt-dlp warning:', err.message);
  }
}

const HAS_YTDLP = isYtdlpAvailable();
const HAS_FFMPEG = isFfmpegAvailable();

function getTmpDir() {
  const dir = path.join(os.tmpdir(), 'ytmusic-dl');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmpFile(filepath) {
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (_) {}
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${mins}:${secs}`;
}

function normalizeUrl(url) {
  let u = (url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  return u;
}

function isValidYouTubeUrl(url) {
  const u = normalizeUrl(url).toLowerCase();
  return (
    u.includes('youtube.com/') ||
    u.includes('youtu.be/') ||
    u.includes('music.youtube.com/')
  );
}

function extractVideoId(url) {
  if (!url) return null;
  const clean = normalizeUrl(url);

  // Shorts: youtube.com/shorts/ID
  let match = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];

  // youtu.be/ID
  match = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];

  // watch?v=ID or &v=ID
  match = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];

  // embed/ID
  match = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];

  return null;
}

function isPlaylistUrl(url) {
  const u = normalizeUrl(url).toLowerCase();
  // Explicit playlist or album URL
  if (u.includes('/playlist') || u.includes('/album')) return true;

  // Has list= query parameter AND does NOT have a specific video identifier
  if (u.includes('list=') && !u.includes('v=') && !u.includes('youtu.be/') && !u.includes('/shorts/')) {
    return true;
  }

  return false;
}

/* ────────────────────── yt-dlp Metadata ────────────────────── */

function getYtdlpBaseArgs() {
  const base = [
    '--no-warnings',
    '--no-check-certificates',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ];
  const ffmpegPath = getFfmpegPath();
  if (ffmpegPath) {
    base.push('--ffmpeg-location', ffmpegPath);
  }
  if (!process.env.YT_COOKIES_PATH) {
    const rootCookies = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(rootCookies)) {
      process.env.YT_COOKIES_PATH = rootCookies;
    }
  }
  if (process.env.YT_COOKIES_PATH && fs.existsSync(process.env.YT_COOKIES_PATH)) {
    base.push('--cookies', process.env.YT_COOKIES_PATH);
  }
  if (process.env.PROXY_URL) {
    base.push('--proxy', process.env.PROXY_URL);
  }
  return base;
}

function ytdlpGetJson(url, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-download',
      '--dump-json',
      ...getYtdlpBaseArgs(),
      ...extraArgs,
      url,
    ];

    const ytdlpBin = getYtdlpExecutable();

    execFile(ytdlpBin, args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        const tryFallback = () => {
          // Fallback to python3 -m yt_dlp
          return execFile(
            'python3',
            ['-m', 'yt_dlp', ...args],
            { maxBuffer: 50 * 1024 * 1024, timeout: 120000 },
            (py3Err, py3Stdout) => {
              if (!py3Err) {
                return parseLines(py3Stdout);
              }
              // Fallback to python -m yt_dlp
              return execFile(
                'python',
                ['-m', 'yt_dlp', ...args],
                { maxBuffer: 50 * 1024 * 1024, timeout: 120000 },
                (pyErr, pyStdout) => {
                  if (!pyErr) {
                    return parseLines(pyStdout);
                  }
                  return reject(new Error(stderr || err.message || 'yt-dlp failed to retrieve video info'));
                }
              );
            }
          );
        };

        if (ytdlpBin !== 'yt-dlp') {
          return execFile('yt-dlp', args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (e2, s2) => {
            if (!e2) return parseLines(s2);
            tryFallback();
          });
        }

        return tryFallback();
      }
      parseLines(stdout);
    });

    function parseLines(raw) {
      try {
        const lines = raw.trim().split('\n').filter(Boolean);
        const items = lines.map((l) => JSON.parse(l));
        resolve(items);
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp output.'));
      }
    }
  });
}

async function resolveMetadata(rawUrl) {
  if (!HAS_YTDLP) {
    throw new Error(
      'yt-dlp is not installed on the server. Please install yt-dlp and ffmpeg — see How Run .txt for instructions.'
    );
  }

  const url = normalizeUrl(rawUrl);
  const isPlaylist = isPlaylistUrl(url);

  if (isPlaylist) {
    // Fetch playlist metadata (cap at 100 tracks for performance)
    const items = await ytdlpGetJson(url, ['--flat-playlist', '--playlist-end', '100']);

    if (!items || items.length === 0) {
      throw new Error('No tracks found in this playlist.');
    }

    const firstItem = items[0];
    const playlistTitle =
      firstItem.playlist_title || firstItem.playlist || firstItem.title || 'YouTube Playlist';
    const playlistUploader =
      firstItem.playlist_uploader || firstItem.uploader || firstItem.channel || 'Unknown';

    const tracks = items.map((item, idx) => {
      const vid = item.id || item.url || '';
      const thumb =
        item.thumbnails?.slice(-1)[0]?.url ||
        item.thumbnail ||
        (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '');

      return {
        id: vid,
        videoId: vid,
        num: idx + 1,
        title: item.title || 'Unknown',
        artist: item.uploader || item.channel || playlistUploader,
        duration: formatDuration(item.duration),
        artworkUrl: thumb,
        youtubeUrl: item.url && item.url.startsWith('http')
          ? item.url
          : `https://www.youtube.com/watch?v=${vid}`,
      };
    });

    const artworkUrl =
      tracks[0]?.artworkUrl ||
      firstItem.thumbnails?.slice(-1)[0]?.url ||
      firstItem.thumbnail ||
      (tracks[0]?.videoId ? `https://i.ytimg.com/vi/${tracks[0].videoId}/hqdefault.jpg` : '');

    return {
      isPlaylist: true,
      title: playlistTitle,
      artist: playlistUploader,
      artworkUrl,
      trackCount: tracks.length,
      sourceUrl: url,
      tracks,
    };
  } else {
    // Single video/track: isolate videoId to prevent radio mix / endless list processing
    const videoId = extractVideoId(url);
    const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

    const items = await ytdlpGetJson(targetUrl, ['--no-playlist']);
    const info = items[0];
    if (!info) throw new Error('Could not fetch video information.');

    const artworkUrl =
      info.thumbnails?.slice(-1)[0]?.url ||
      info.thumbnail ||
      `https://i.ytimg.com/vi/${info.id || videoId}/hqdefault.jpg`;

    const vid = info.id || videoId;

    return {
      isPlaylist: false,
      title: info.title || 'Unknown',
      artist: info.uploader || info.channel || info.artist || 'Unknown',
      album: info.album || '',
      artworkUrl,
      duration: formatDuration(info.duration),
      sourceUrl: targetUrl,
      tracks: [
        {
          id: vid,
          videoId: vid,
          num: 1,
          title: info.title || 'Unknown',
          artist: info.uploader || info.channel || info.artist || 'Unknown',
          duration: formatDuration(info.duration),
          artworkUrl,
          youtubeUrl: `https://www.youtube.com/watch?v=${vid}`,
        },
      ],
    };
  }
}

/* ────────────────────── yt-dlp Download ────────────────────── */

function ytdlpDownload(videoUrl, bitrate = '320') {
  return new Promise((resolve, reject) => {
    const tmpDir = getTmpDir();
    const uid = crypto.randomBytes(8).toString('hex');
    const outTemplate = path.join(tmpDir, `${uid}-%(title)s.%(ext)s`);

    const videoId = extractVideoId(videoUrl);
    const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;

    const args = [
      '-x',                          // extract audio
      '--audio-format', 'mp3',       // convert to MP3
      '--audio-quality', `${bitrate}K`,
      '--no-playlist',               // single video only
      ...getYtdlpBaseArgs(),
      '-o', outTemplate,
      targetUrl,
    ];

    const ytdlpBin = getYtdlpExecutable();

    function execute(cmd, cmdArgs) {
      execFile(cmd, cmdArgs, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }, (err, stdout, stderr) => {
        if (err) {
          if (cmd === ytdlpBin && cmd !== 'yt-dlp') {
            return execute('yt-dlp', args);
          } else if (cmd === 'yt-dlp' || cmd === ytdlpBin) {
            return execute('python3', ['-m', 'yt_dlp', ...args]);
          } else if (cmd === 'python3') {
            return execute('python', ['-m', 'yt_dlp', ...args]);
          }
          return reject(new Error(stderr || err.message || 'yt-dlp download failed'));
        }

        // Find the output file
        const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(uid) && f.endsWith('.mp3'));
        if (files.length === 0) {
          const anyFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith(uid));
          if (anyFiles.length === 0) {
            return reject(new Error('Download completed but audio file was not created.'));
          }
          const filepath = path.join(tmpDir, anyFiles[0]);
          const buffer = fs.readFileSync(filepath);
          const ext = path.extname(anyFiles[0]).slice(1);
          cleanTmpFile(filepath);
          return resolve({
            buffer,
            filename: anyFiles[0].replace(`${uid}-`, ''),
            mime: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`,
          });
        }

        const filepath = path.join(tmpDir, files[0]);
        const buffer = fs.readFileSync(filepath);
        cleanTmpFile(filepath);

        resolve({
          buffer,
          filename: files[0].replace(`${uid}-`, ''),
          mime: 'audio/mpeg',
        });
      });
    }

    execute(ytdlpBin, args);
  });
}

function formatYtdlpError(rawErr) {
  const msg = rawErr || '';
  if (
    msg.includes('Sign in to confirm you') ||
    msg.includes('Failed to extract any player response') ||
    msg.includes('confirm you’re not a bot') ||
    msg.includes('bot detection')
  ) {
    return 'YouTube requires authentication on cloud servers. Click "YouTube Cookies" in the top bar to paste your cookies and unlock downloads.';
  }
  return msg || 'Download failed.';
}

/* ────────────────────── API Routes ────────────────────── */

app.get('/api/health', (_req, res) => {
  const hasCookies = Boolean(
    process.env.YT_COOKIES_PATH && fs.existsSync(process.env.YT_COOKIES_PATH)
  );
  res.json({
    ok: true,
    ytdlp: HAS_YTDLP,
    ffmpeg: HAS_FFMPEG,
    fullDownload: HAS_YTDLP && HAS_FFMPEG,
    hasCookies,
  });
});

app.get('/api/cookies/status', (_req, res) => {
  const hasCookies = Boolean(
    process.env.YT_COOKIES_PATH && fs.existsSync(process.env.YT_COOKIES_PATH)
  );
  res.json({ ok: true, hasCookies });
});

app.post('/api/cookies', (req, res) => {
  try {
    const raw = (req.body?.cookies || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'Cookies text cannot be empty.' });
    }
    const cookiesFile = path.join(__dirname, 'cookies.txt');
    fs.writeFileSync(cookiesFile, raw, 'utf8');
    process.env.YT_COOKIES_PATH = cookiesFile;
    res.json({ ok: true, message: 'YouTube cookies saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed saving cookies: ' + err.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const rawUrl = (req.body?.url || '').trim();
    if (!rawUrl || !isValidYouTubeUrl(rawUrl)) {
      return res.status(400).json({
        error: 'Please paste a valid YouTube or YouTube Music link (e.g. https://www.youtube.com/watch?v=... or https://music.youtube.com/...)',
      });
    }
    const metadata = await resolveMetadata(rawUrl);
    res.json({ ok: true, metadata });
  } catch (err) {
    res.status(400).json({ error: formatYtdlpError(err.message) });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    if (!HAS_YTDLP) {
      return res.status(500).json({
        error: 'yt-dlp is not installed. Please install yt-dlp and ffmpeg on the server.',
      });
    }

    const videoUrl = req.query.url;
    const videoId = req.query.videoId;
    const bitrate = req.query.bitrate || '320';

    const targetUrl = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing video URL or ID.' });
    }

    const file = await ytdlpDownload(targetUrl, bitrate);
    const safeFilename = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');

    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`
    );
    res.setHeader('X-Download-Source', 'full');
    res.send(file.buffer);
  } catch (err) {
    res.status(400).json({ error: formatYtdlpError(err.message) });
  }
});

app.post('/api/download-zip', async (req, res) => {
  try {
    if (!HAS_YTDLP) {
      return res.status(500).json({ error: 'yt-dlp is not installed on the server.' });
    }

    const tracks = req.body?.tracks;
    const bitrate = req.body?.bitrate || '320';

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: 'No tracks to zip.' });
    }

    const zip = new JSZip();
    let added = 0;

    for (const t of tracks) {
      try {
        const targetUrl =
          t.youtubeUrl || (t.videoId ? `https://www.youtube.com/watch?v=${t.videoId}` : null);
        if (!targetUrl) continue;

        const file = await ytdlpDownload(targetUrl, bitrate);
        zip.file(file.filename, file.buffer);
        added++;
      } catch (_) {
        /* skip failed tracks */
      }
    }

    if (added === 0) {
      return res.status(400).json({ error: 'Could not download any tracks for the ZIP.' });
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const cleanZipName = (req.body?.zipName || 'YouTube-Music-Playlist').replace(/[\\/:*?"<>|]/g, '');
    const safeZipName = cleanZipName.replace(/[^\x20-\x7E]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeZipName}.zip"; filename*=UTF-8''${encodeURIComponent(cleanZipName)}.zip`
    );
    res.setHeader('X-Tracks-Included', String(added));
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: formatYtdlpError(err.message) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`YouTube Music Downloader running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(HAS_YTDLP ? '✓ yt-dlp detected' : '✗ yt-dlp NOT found — install it for downloads');
  console.log(HAS_FFMPEG ? '✓ ffmpeg detected' : '✗ ffmpeg NOT found — install it for MP3 conversion');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other server or run: $env:PORT=3001; npm start`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
