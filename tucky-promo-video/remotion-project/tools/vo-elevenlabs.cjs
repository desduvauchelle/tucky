// ElevenLabs version of vo-notetaker.cjs / vo-dictation.cjs: one TTS clip per short line with per-character
// voices (script.json -> elevenlabs.voices), loudnorm each to -16 LUFS, write the short's durations.json
// (sec = trimmed clip duration, no tail; the compositions add cut/gap/hold frames). Same outputs/contract as the per-short Hume tools.
//   ELEVENLABS_API_KEY=sk_... node tools/vo-elevenlabs.cjs                    (both shorts)
//   ENV_FILE=/path/to/.env node tools/vo-elevenlabs.cjs      (ELEVENLABS_API_KEY= or ELEVEN_API_KEY= line)
//   --short notetaker|dictation|all   which short(s) to voice (default all)
//        notetaker -> src/notetaker/script.json  -> public/notetaker/vo/n-<id>.wav, src/notetaker/durations.json
//        dictation -> src/dictation/script.json  -> public/dictation/vo/d-<id>.wav, src/dictation/durations.json
//   --only 01,05,14   regenerate only those line ids of ONE short (needs --short notetaker|dictation, refused with
//                     all); other durations kept from that short's existing durations.json
//   --dry-run         print the requests, no key / network / ffmpeg / file writes
// No silent fallback: missing key / API error exits non-zero and writes nothing for the failing short.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
// Leading/trailing silence is trimmed (-45dB) after loudnorm; areverse trick so mid-line pauses survive.
const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse';
const SHORTS = {
  notetaker: { script: 'src/notetaker/script.json', dur: 'src/notetaker/durations.json', out: 'public/notetaker/vo', prefix: 'n' },
  dictation: { script: 'src/dictation/script.json', dur: 'src/dictation/durations.json', out: 'public/dictation/vo', prefix: 'd' },
};
const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const si = argv.indexOf('--short');
const shortArg = si >= 0 ? (argv[si + 1] || '') : 'all';
if (shortArg !== 'all' && !SHORTS[shortArg]) { console.error('FATAL: --short must be notetaker, dictation or all (got "' + shortArg + '")'); process.exit(2); }
const oi = argv.indexOf('--only');
const only = oi >= 0 ? new Set((argv[oi + 1] || '').split(',').map(s => s.trim()).filter(Boolean)) : null;
if (oi >= 0 && !only.size) { console.error('FATAL: --only needs a comma-separated list of line ids'); process.exit(2); }
if (only && shortArg === 'all') { console.error('FATAL: --only needs --short notetaker|dictation (line ids collide across shorts)'); process.exit(2); }
const names = shortArg === 'all' ? Object.keys(SHORTS) : [shortArg];

// Load + validate every selected short up front so nothing is sent if any config is bad.
const jobs = names.map(name => {
  const cfg = SHORTS[name];
  const script = JSON.parse(fs.readFileSync(path.join(root, cfg.script), 'utf8'));
  const EL = script.elevenlabs;
  if (!EL || !EL.voices) { console.error(`FATAL: ${cfg.script} has no "elevenlabs.voices" config`); process.exit(2); }
  if (only) { const bad = [...only].filter(id => !script.shots.some(s => s.id === id)); if (bad.length) { console.error(`FATAL: unknown line id(s) for ${name}:`, bad.join(',')); process.exit(2); } }
  const shots = script.shots.filter(s => !only || only.has(s.id));
  const missingVoice = shots.filter(s => !EL.voices[s.who]);
  if (missingVoice.length) { console.error(`FATAL: no elevenlabs voice in ${name} for`, [...new Set(missingVoice.map(s => s.who))].join(',')); process.exit(2); }
  return { name, cfg, script, EL, shots, model: EL.model_id || 'eleven_multilingual_v2', outDir: path.join(root, cfg.out), durPath: path.join(root, cfg.dur) };
});
const buildReq = (job, s) => {
  const v = job.EL.voices[s.who];
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`,
    body: { text: s.text, model_id: job.model, voice_settings: { stability: v.stability, similarity_boost: v.similarity_boost ?? 0.75, style: v.style, speed: v.speed } },
  };
};

if (dry) {
  for (const job of jobs) {
    for (const s of job.shots) {
      const r = buildReq(job, s);
      console.log(`[dry-run] ${job.name} ${s.id} ${s.who} (${job.EL.voices[s.who].name}) -> ${path.join(job.cfg.out, `${job.cfg.prefix}-${s.id}.wav`)}\n  POST ${r.url}\n  xi-api-key: <redacted>\n  ${JSON.stringify(r.body)}`);
    }
    console.log(`dry-run ${job.name}: ${job.shots.length} request(s) -> ${job.cfg.dur}`);
  }
  console.log(`dry-run: ${jobs.reduce((n, j) => n + j.shots.length, 0)} request(s) total, nothing sent or written`); process.exit(0);
}

let key = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY;
if (!key && process.env.ENV_FILE) {
  const m = fs.readFileSync(process.env.ENV_FILE, 'utf8').match(/^(?:ELEVENLABS_API_KEY|ELEVEN_API_KEY)=(.*)$/m);
  if (m) key = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!key) { console.error('FATAL: no ELEVENLABS_API_KEY (env var or ENV_FILE with ELEVENLABS_API_KEY= / ELEVEN_API_KEY=). Not falling back.'); process.exit(2); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function tts(job, s) {
  const { url, body } = buildReq(job, s);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if ((r.status === 429 || r.status >= 500) && attempt === 0) { console.warn(`WARN ${job.name} line ${s.id}: HTTP ${r.status}, retrying once in 2s`); await sleep(2000); continue; }
    const txt = await r.text();
    console.error('FATAL ElevenLabs error', job.name, 'line', s.id, r.status, txt.slice(0, 600)); process.exit(1);
  }
}
(async () => {
  for (const job of jobs) {
    fs.mkdirSync(job.outDir, { recursive: true });
    let sec = {};
    if (only) {
      try { const prev = JSON.parse(fs.readFileSync(job.durPath, 'utf8')); if (prev.vo) sec = prev.sec || {}; } catch (e) { /* no previous durations */ }
    }
    for (const s of job.shots) {
      const raw = path.join(job.outDir, `raw-${s.id}.mp3`); fs.writeFileSync(raw, await tts(job, s));
      const wav = path.join(job.outDir, `${job.cfg.prefix}-${s.id}.wav`);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,' + TRIM, '-ar', '44100', wav]);
      const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
      sec[s.id] = +d.toFixed(3); console.log('elevenlabs', job.name, s.id, s.who, d.toFixed(2));
    }
    const missing = job.script.shots.filter(s => sec[s.id] == null).map(s => s.id);
    if (missing.length) { console.error(`FATAL: no duration for ${job.name} line(s)`, missing.join(','), '- run once without --only first. durations.json NOT written.'); process.exit(1); }
    fs.writeFileSync(job.durPath, JSON.stringify({ vo: true, sec }, null, 1)); console.log('done', job.name);
  }
})();
