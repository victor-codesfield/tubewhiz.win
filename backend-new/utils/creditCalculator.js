/**
 * Normalize a duration value to total seconds.
 * Accepts: number (seconds), numeric string, or ISO 8601 ("PT1H2M10S").
 * @param {string|number|null} duration
 * @returns {number} total seconds
 */
function toSeconds(duration) {
    if (!duration && duration !== 0) return 0;
    // Already a number (seconds from extension)
    if (typeof duration === 'number') return duration;
    // Numeric string
    if (/^\d+$/.test(duration)) return parseInt(duration, 10);
    // ISO 8601
    const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

/**
 * Calculate credits for a video based on duration
 * 1 credit = 10 minutes of video, rounded up, minimum 1
 * @param {string|number|null} duration - seconds (number) or ISO 8601 string
 * @returns {number} credits required
 */
function calculateCredits(duration) {
    const totalSeconds = toSeconds(duration);
    if (totalSeconds <= 0) return 1;
    const totalMinutes = Math.ceil(totalSeconds / 60);
    return Math.max(1, Math.ceil(totalMinutes / 10));
}

/**
 * Parse duration to total seconds (alias for toSeconds)
 * @param {string|number|null} duration
 * @returns {number} total seconds
 */
function parseDurationToSeconds(duration) {
    return toSeconds(duration);
}

module.exports = { calculateCredits, parseDurationToSeconds };
