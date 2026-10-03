/**
 * scripts/install-ytdlp.js
 * Automatically downloads and installs the latest yt-dlp standalone binary
 * into ./bin so the app works on ANY cloud environment (Render, Railway, Heroku, etc.)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const binDir = path.join(__dirname, '..', 'bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const isWin = process.platform === 'win32';
const targetBinary = path.join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
const downloadUrl = isWin
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        // Handle HTTP 301/302 redirects from GitHub releases
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download binary: HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (!isWin) {
              try {
                fs.chmodSync(dest, 0o755);
              } catch (_) {}
            }
            resolve();
          });
        });
        file.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      })
      .on('error', reject);
  });
}

async function main() {
  console.log('[install-ytdlp] Checking yt-dlp installation...');

  // 1. Download standalone binary into ./bin
  try {
    console.log(`[install-ytdlp] Downloading latest yt-dlp binary from ${downloadUrl}...`);
    await downloadFile(downloadUrl, targetBinary);
    console.log(`[install-ytdlp] Successfully installed yt-dlp to: ${targetBinary}`);
  } catch (err) {
    console.warn(`[install-ytdlp] Could not download standalone binary: ${err.message}`);
  }

  // 2. Also try pip / python3 install as a backup
  try {
    console.log('[install-ytdlp] Ensuring python yt-dlp module is installed...');
    execSync('python3 -m pip install -U --break-system-packages yt-dlp || pip3 install -U yt-dlp || pip install -U yt-dlp', {
      stdio: 'inherit',
    });
  } catch (_) {
    // Non-fatal if pip is not available, since binary was downloaded
  }
}

main().catch((e) => {
  console.error('[install-ytdlp] Setup encountered an issue:', e.message);
});
