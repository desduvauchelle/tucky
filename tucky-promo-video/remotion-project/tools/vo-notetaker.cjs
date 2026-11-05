// Generates one Hume TTS clip per NotetakerShort line (saved "Tucky Narrator" voice + per-character direction),
// loudnorms each to -16 LUFS, and writes src/notetaker/durations.json (shot seconds = clip + 0.25s tail).
//   ENV_FILE=/path/to/.env node tools/vo-notetaker.cjs          -> real VO (needs HUME_API_KEY in ENV_FILE or env)
//   node tools/vo-notetaker.cjs --novo                          -> explicit captions-only mode, 2.2s per shot, vo:false
// No silent fallback: missing key / API error exits non-zero and writes nothing.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const script = JSON.parse(fs.readFileSync(path.join(root, 'src/notetaker/script.json'), 'utf8'));
const outDir = path.join(root, 'public/notetaker/vo'); fs.mkdirSync(outDir, { recursive: true });
const durPath = path.join(root, 'src/notetaker/durations.json');
const TAIL = 0.25;
if (process.argv.includes('--novo')) {
  const d = { vo: false, sec: Object.fromEntries(script.shots.map(s => [s.id, 2.2])) };
  fs.writeFileSync(durPath, JSON.stringify(d, null, 1)); console.log('NOVO durations written (2.2s/shot)'); process.exit(0);
}
let key = process.env.HUME_API_KEY;
if (!key && process.env.ENV_FILE) { const m = fs.readFileSync(process.env.ENV_FILE, 'utf8').match(/^HUME_API_KEY=(.*)$/m); if (m) key = m[1].replace(/^"|"$/g, ''); }
if (!key) { console.error('FATAL: no HUME_API_KEY (env var or ENV_FILE). Not falling back. Re-run with --novo for captions-only.'); process.exit(2); }
const voice = JSON.parse(fs.readFileSync(path.join(root, 'public/vo/voice.json'), 'utf8'));
const H = { 'X-Hume-Api-Key': key, 'Content-Type': 'application/json' };
(async () => {
  const sec = {};
  for (const s of script.shots) {
    const v = script.voices[s.who];
    const body = { utterances: [{ text: s.text, voice: { name: voice.name, provider: 'CUSTOM_VOICE' }, description: v.description, speed: v.speed, trailing_silence: 0.05 }], format: { type: 'mp3' }, num_generations: 1 };
    const r = await fetch('https://api.hume.ai/v0/tts', { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) { console.error('FATAL Hume error line', s.id, r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
    const raw = path.join(outDir, `raw-${s.id}.mp3`); fs.writeFileSync(raw, Buffer.from(j.generations[0].audio, 'base64'));
    const wav = path.join(outDir, `n-${s.id}.wav`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', wav]);
    const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
    sec[s.id] = +(d + TAIL).toFixed(3); console.log('hume', s.id, s.who, d.toFixed(2));
  }
  fs.writeFileSync(durPath, JSON.stringify({ vo: true, sec }, null, 1)); console.log('done');
})();
