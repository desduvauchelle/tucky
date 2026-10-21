//! Guards against ASR hallucinations on silence ("Thank you.", "Thanks for
//! watching.", ...). Two pure pieces used by [`super::pipeline::AsrPipeline`]:
//!
//! 1. [`analyze`] + [`is_silent`]: a silence gate run on the 16 kHz mono buffer
//!    *before* inference, so a clip with no speech never reaches the model.
//! 2. [`should_drop_hallucination`]: a post-filter that drops output which is
//!    exactly a known hallucination phrase AND whose audio was short / quiet.
//!    A clearly spoken "thank you" (enough voiced audio at normal energy) is kept.

/// 30 ms frames at 16 kHz.
const FRAME_SAMPLES: usize = 480;
const FRAME_MS: usize = 30;

/// A frame counts as voiced above this RMS (~-48 dBFS).
const VOICED_FRAME_RMS: f32 = 0.004;
/// Whole clip peak below this (~-40 dBFS) is treated as silence/room noise.
const SILENCE_PEAK: f32 = 0.01;
/// Less than this much voiced audio (3 frames) is not speech.
const MIN_VOICED_MS: usize = 90;
/// Hallucination filter: output is suspicious if the voiced audio is shorter than this...
const HALLUCINATION_MAX_VOICED_MS: usize = 250;
/// ...or if the voiced frames' RMS is below this (~-40 dBFS; normal speech is ~0.02-0.1).
const HALLUCINATION_MAX_SPEECH_RMS: f32 = 0.01;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioStats {
    pub duration_ms: usize,
    pub rms: f32,
    pub peak: f32,
    pub voiced_ms: usize,
    /// RMS over voiced frames only (0.0 if none).
    pub speech_rms: f32,
}

pub fn analyze(samples: &[f32]) -> AudioStats {
    let mut sum_sq = 0.0f64;
    let mut peak = 0.0f32;
    let mut voiced_frames = 0usize;
    let mut voiced_sq = 0.0f64;
    let mut voiced_n = 0usize;
    for frame in samples.chunks(FRAME_SAMPLES) {
        let sq: f64 = frame.iter().map(|s| (*s as f64) * (*s as f64)).sum();
        sum_sq += sq;
        for s in frame {
            peak = peak.max(s.abs());
        }
        let frame_rms = (sq / frame.len() as f64).sqrt() as f32;
        if frame_rms > VOICED_FRAME_RMS {
            voiced_frames += 1;
            voiced_sq += sq;
            voiced_n += frame.len();
        }
    }
    let n = samples.len().max(1) as f64;
    AudioStats {
        duration_ms: samples.len() / 16,
        rms: (sum_sq / n).sqrt() as f32,
        peak,
        voiced_ms: voiced_frames * FRAME_MS,
        speech_rms: if voiced_n > 0 {
            (voiced_sq / voiced_n as f64).sqrt() as f32
        } else {
            0.0
        },
    }
}

/// True when the clip contains no speech and must not be sent to the model.
pub fn is_silent(stats: &AudioStats) -> bool {
    stats.peak < SILENCE_PEAK || stats.voiced_ms < MIN_VOICED_MS
}

/// Normalize for matching: lowercase, drop punctuation, collapse whitespace.
fn normalize(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

const HALLUCINATIONS: &[&str] = &[
    // en
    "thank you",
    "thanks",
    "thank you so much",
    "thanks for watching",
    "thank you for watching",
    "thank you for watching this video",
    "you",
    "bye",
    "bye bye",
    "please subscribe",
    "subtitles by the amara org community",
    // de
    "danke",
    "vielen dank",
    "danke fürs zuschauen",
    "untertitel der amara org community",
    "untertitel im auftrag des zdf für funk 2017",
    // es
    "gracias",
    "muchas gracias",
    "gracias por ver el video",
    "subtítulos realizados por la comunidad de amara org",
    // fr
    "merci",
    "merci beaucoup",
    "merci d avoir regardé cette vidéo",
    "sous titres réalisés par la communauté d amara org",
    // it
    "grazie",
    "grazie mille",
    "grazie a tutti",
    "sottotitoli creati dalla comunità amara org",
    // nl
    "dank je",
    "dank je wel",
    "bedankt",
    "bedankt voor het kijken",
    "ondertitels ingediend door de amara org gemeenschap",
    // pl
    "dziękuję",
    "dziękuję bardzo",
    "dzięki",
    "napisy stworzone przez społeczność amara org",
    // pt
    "obrigado",
    "obrigada",
    "muito obrigado",
    "legendas pela comunidade amara org",
];

pub fn is_known_hallucination(text: &str) -> bool {
    let n = normalize(text);
    !n.is_empty() && HALLUCINATIONS.contains(&n.as_str())
}

/// Drop `text` when it is exactly a known hallucination AND the audio was short or quiet.
pub fn should_drop_hallucination(text: &str, stats: &AudioStats) -> bool {
    is_known_hallucination(text)
        && (stats.voiced_ms < HALLUCINATION_MAX_VOICED_MS
            || stats.speech_rms < HALLUCINATION_MAX_SPEECH_RMS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(ms: usize, amp: f32) -> Vec<f32> {
        (0..ms * 16)
            .map(|i| amp * (i as f32 * 0.3).sin())
            .collect()
    }

    #[test]
    fn silent_buffer_is_skipped() {
        let s = analyze(&vec![0.0; 16_000 * 3]);
        assert!(is_silent(&s));
    }

    #[test]
    fn faint_noise_is_skipped() {
        let s = analyze(&tone(3000, 0.003));
        assert!(is_silent(&s));
    }

    #[test]
    fn speech_energy_passes() {
        let s = analyze(&tone(1000, 0.1));
        assert!(!is_silent(&s));
    }

    #[test]
    fn speech_with_long_pause_passes() {
        let mut a = tone(500, 0.1);
        a.extend(vec![0.0; 16_000 * 5]);
        assert!(!is_silent(&analyze(&a)));
    }

    #[test]
    fn thank_you_on_low_energy_is_dropped() {
        let s = analyze(&tone(3000, 0.012)); // peak passes gate but speech rms < 0.01
        assert!(should_drop_hallucination("Thank you.", &s));
    }

    #[test]
    fn thank_you_on_brief_audio_is_dropped() {
        let mut a = vec![0.0; 16_000 * 3];
        a.extend(tone(120, 0.2));
        let s = analyze(&a);
        assert!(should_drop_hallucination("Thank you.", &s));
    }

    #[test]
    fn thank_you_spoken_normally_is_kept() {
        let s = analyze(&tone(800, 0.1));
        assert!(!should_drop_hallucination("Thank you.", &s));
    }

    #[test]
    fn normal_sentence_is_kept_even_on_low_energy() {
        let s = analyze(&tone(3000, 0.012));
        assert!(!should_drop_hallucination("Thank you for the update, see you Monday.", &s));
    }

    #[test]
    fn multilingual_phrases_match() {
        for p in ["Danke.", "¡Gracias!", "Merci.", "Grazie.", "Dziękuję.", "Obrigado.", "Dank je wel."] {
            assert!(is_known_hallucination(p), "{p}");
        }
        assert!(is_known_hallucination(
            "Sous-titres réalisés par la communauté d'Amara.org"
        ));
    }
}
