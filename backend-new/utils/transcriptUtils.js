/**
 * Parse duration to total seconds.
 * Accepts: number (seconds), numeric string, or ISO 8601 ("PT1H2M10S").
 * @param {string|number|null} duration
 * @returns {number} total seconds
 */
function parseDuration(duration) {
    if (!duration && duration !== 0) return 0;
    if (typeof duration === 'number') return duration;
    if (/^\d+$/.test(duration)) return parseInt(duration, 10);
    const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

/**
 * Sample/truncate a transcript for use as AI context.
 *
 * - If the video is <= 1 hour (3600s), return the full transcript (up to hard limit).
 * - For videos > 1 hour, keep every 3rd sentence to reduce size while preserving coverage.
 * - Hard character limit: 36000 characters.
 *
 * @param {string|null} transcript - The full transcript text
 * @param {string|null} durationISO - ISO 8601 duration of the video
 * @returns {string|null} The sampled transcript, or null if input is null/empty
 */
function sampleTranscript(transcript, durationISO) {
    if (!transcript || transcript.trim().length === 0) return null;

    const HARD_LIMIT = 36000;
    const ONE_HOUR = 3600;

    const durationSeconds = parseDuration(durationISO);

    // For short videos (<= 1 hour), return full transcript up to hard limit
    if (durationSeconds <= ONE_HOUR) {
        if (transcript.length <= HARD_LIMIT) {
            return transcript;
        }
        return transcript.substring(0, HARD_LIMIT);
    }

    // For longer videos, keep every 3rd sentence
    // Split on sentence boundaries (period, exclamation, question mark followed by space or end)
    const sentences = transcript.match(/[^.!?]+[.!?]+[\s]*/g);

    if (!sentences || sentences.length === 0) {
        // Fallback: if no sentence boundaries found, just truncate
        return transcript.substring(0, HARD_LIMIT);
    }

    const sampled = [];
    let totalLength = 0;

    for (let i = 0; i < sentences.length; i++) {
        // Keep every 3rd sentence (index 0, 3, 6, 9, ...)
        if (i % 3 === 0) {
            const sentence = sentences[i];
            if (totalLength + sentence.length > HARD_LIMIT) {
                break;
            }
            sampled.push(sentence);
            totalLength += sentence.length;
        }
    }

    return sampled.join('').trim() || transcript.substring(0, HARD_LIMIT);
}

module.exports = { sampleTranscript, parseDuration };
