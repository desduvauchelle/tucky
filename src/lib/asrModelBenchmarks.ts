/** Measured with `bash scripts/bench-asr.sh` on 2026-10-21 (Apple M5 Pro, release asr-lab worker).
 * Clips: 9 clips, 194.6 s of audio, 739 reference words, reused for every model:
 *   - output/voice-sample-2026-09-26 (28.7 s, real voice, 53 words), and
 *   - output/asr-comparison/personal/*.wav (8 clips of the owner's saved dictations
 *     read by macOS "Samantha" TTS at 200 wpm: synthetic audio, 686 words).
 * errors/words: summed literal word edits (case/punctuation-insensitive).
 * warmSeconds: sum over clips of the median of 3 warm runs, taking the faster of two full
 * passes per clip (the machine was shared with other builds); divide by benchmarkAudioSeconds for RTF.
 * loadSeconds: median model load. memoryGiB: peak RSS of the model process (the
 * worker subprocess for qwen/nemotron), not physical footprint or GPU memory.
 * cpuPercent: CPU time / wall time of that process during warm runs, 100 = one core;
 * GPU work (Whisper on Metal, Qwen on MLX) does not show up here, so low = idle CPU, not "cheap".
 * nemotron-3.5-streaming has no row: its 682 MB model was not downloaded for this run.
 */
export const benchmarkAudioSeconds = 194.6;
export const asrModelBenchmarks: Record<string, {
  errors: number;
  words: number;
  warmSeconds: number;
  loadSeconds: number;
  memoryGiB: number;
  cpuPercent: number;
}> = {
  "parakeet-v3": { errors: 19, words: 739, warmSeconds: 6.49, loadSeconds: 0.70, memoryGiB: 2.16, cpuPercent: 467 },
  "whisper-base": { errors: 27, words: 739, warmSeconds: 2.58, loadSeconds: 0.28, memoryGiB: 0.36, cpuPercent: 93 },
  "whisper-turbo": { errors: 15, words: 739, warmSeconds: 21.85, loadSeconds: 0.44, memoryGiB: 0.81, cpuPercent: 12 },
  "qwen3-asr": { errors: 16, words: 739, warmSeconds: 10.77, loadSeconds: 2.12, memoryGiB: 0.88, cpuPercent: 92 },
};

export const benchmarkRtf = (warmSeconds: number) => warmSeconds / benchmarkAudioSeconds;
export const benchmarkWerPercent = (row: { errors: number; words: number }) => (row.errors / row.words) * 100;

type Metric = "errors" | "warmSeconds" | "memoryGiB" | "cpuPercent";
const rate = (row: { errors: number; words: number }, metric: Metric) =>
  metric === "errors" ? row.errors / row.words : (row as unknown as Record<Metric, number>)[metric];

/** Relative ranks: best = 5; lose one bar per model with a better result.
 * Ties share a score. Higher always means better (including lower RAM/CPU use).
 * For "errors", pass the error count (all rows share the same word count).
 */
export function benchmarkGrade(metric: Metric, value: number) {
  const own = metric === "errors" ? value / Object.values(asrModelBenchmarks)[0].words : value;
  return Math.max(1, 5 - Object.values(asrModelBenchmarks).filter(row => rate(row, metric) < own).length);
}
