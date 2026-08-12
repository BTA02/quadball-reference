// video.mjs — download + frame sampling helpers (yt-dlp + ffmpeg)

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(cmd, args, { onData } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = '';
    child.stdout.on('data', (d) => { if (onData) onData(d.toString()); });
    child.stderr.on('data', (d) => { stderr += d.toString(); if (onData) onData(d.toString()); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`)));
  });
}

/**
 * Resolve an ffmpeg/ffprobe binary. Order: explicit env override -> common Homebrew
 * locations (covers "installed but npm's PATH can't see it") -> bare name on PATH.
 */
function resolveMediaBin(name, envVar) {
  const env = process.env[envVar];
  if (env && fs.existsSync(env)) return env;
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return name; // fall back to PATH lookup
}
export const ffmpegBin = () => resolveMediaBin('ffmpeg', 'FFMPEG_PATH');
export const ffprobeBin = () => resolveMediaBin('ffprobe', 'FFPROBE_PATH');

/** Verify ffmpeg can actually run. Returns true/false (never throws). */
export async function ffmpegAvailable() {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBin(), ['-version']);
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  });
}

/** Resolve a yt-dlp executable: repo binary if it runs on this OS, else PATH. */
function ytDlpCmd() {
  const repoBin = path.join(REPO_ROOT, 'yt-dlp');
  if (fs.existsSync(repoBin)) {
    try { fs.chmodSync(repoBin, 0o755); } catch {}
    return repoBin;
  }
  return 'yt-dlp'; // assume on PATH (e.g. `pip install yt-dlp`)
}

/** Download a YouTube video at low resolution for cheap frame sampling. */
export async function downloadYoutube(url, outDir) {
  const outPath = path.join(outDir, 'game_video.mp4');
  console.log(`[yt-dlp] downloading ${url} -> ${outPath}`);
  await run(ytDlpCmd(), [
    '-f', 'mp4[height<=480]/worst[ext=mp4]/worst',
    '-o', outPath,
    '--no-playlist',
    url,
  ], { onData: (s) => process.stdout.write(s.includes('%') ? `\r${s.trim().slice(0, 80)}` : '') });
  process.stdout.write('\n');
  if (!fs.existsSync(outPath)) throw new Error('yt-dlp did not produce a file');
  return outPath;
}

/** Probe duration (seconds) via ffprobe, falling back to parsing ffmpeg output. */
export async function probeDuration(videoPath) {
  // 1) Try ffprobe (clean numeric output)
  const viaFfprobe = await new Promise((resolve) => {
    let out = '';
    let errored = false;
    const child = spawn(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath]);
    child.stdout.on('data', (d) => out += d.toString());
    child.on('close', () => resolve(Math.floor(parseFloat(out.trim()) || 0)));
    child.on('error', () => { errored = true; resolve(0); });
  });
  if (viaFfprobe > 0) return viaFfprobe;

  // 2) Fallback: ffmpeg prints "Duration: HH:MM:SS.xx" to stderr. ffmpeg is always present.
  return await new Promise((resolve) => {
    let buf = '';
    const child = spawn(ffmpegBin(), ['-i', videoPath]);
    child.stderr.on('data', (d) => buf += d.toString());
    child.on('error', () => resolve(0));
    child.on('close', () => {
      const m = buf.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(0);
      const secs = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      resolve(Math.floor(secs));
    });
  });
}

/**
 * Extract frames for a [start,end) window at `fps` frames/sec, scaled to `width`px.
 * Returns [{ t, file }] where t is the absolute video timestamp in seconds.
 */
export async function extractFrames(videoPath, { start, end, fps = 1, width = 640, outDir }) {
  const dir = path.join(outDir, `frames_${start}_${end}`);
  fs.mkdirSync(dir, { recursive: true });
  const pattern = path.join(dir, 'f_%05d.jpg');
  await run(ffmpegBin(), [
    '-ss', String(start),
    '-to', String(end),
    '-i', videoPath,
    '-vf', `fps=${fps},scale=${width}:-2`,
    '-q:v', '4',
    '-y', pattern,
  ]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  return files.map((f, i) => ({
    t: Math.round(start + i / fps),
    file: path.join(dir, f),
  }));
}

export function makeTempDir(prefix = 'qb-extract-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export { REPO_ROOT };
