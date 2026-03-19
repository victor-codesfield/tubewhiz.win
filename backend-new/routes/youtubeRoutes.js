const express = require('express');
const { ProxyAgent } = require('undici');
const requireAuth = require('../middleware/requireAuth');
const getUser = require('../models/userModel');
const getTranscript = require('../models/transcriptModel');
const { parseDurationToSeconds } = require('../utils/creditCalculator');
const { sampleTranscript } = require('../utils/transcriptUtils');

const router = express.Router();

const YOUTUBE_API_KEY = () => process.env.YOUTUBE_API_KEY;
const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── Proxy rotation ─────────────────────────────────────────────────────────
const PROXIES = (process.env.PROXY_LIST || '').split(',').filter(Boolean);
let proxyIdx = 0;

function getProxyDispatcher() {
    if (PROXIES.length === 0) return undefined;
    const proxy = PROXIES[proxyIdx % PROXIES.length];
    proxyIdx++;
    return new ProxyAgent(proxy);
}

/** fetch wrapper that routes through proxy if configured, with retry */
async function pfetch(url, opts = {}, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const dispatcher = getProxyDispatcher();
            const fetchOpts = { ...opts };
            if (dispatcher) fetchOpts.dispatcher = dispatcher;
            return await fetch(url, fetchOpts);
        } catch (err) {
            if (attempt < retries) {
                console.log(`[Proxy] Retry ${attempt + 1}/${retries} for ${url.substring(0, 60)}...`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract channel identifier from various YouTube URL formats
 */
function extractChannelIdentifier(url) {
    if (!url) return null;

    // Clean up the URL
    url = url.trim();

    // Handle @username format (with or without full URL)
    const handleMatch = url.match(/@([\w.-]+)/);
    if (handleMatch) {
        return { type: 'handle', value: handleMatch[1] };
    }

    // Handle /channel/UCxxxx format
    const channelIdMatch = url.match(/\/channel\/(UC[\w-]+)/);
    if (channelIdMatch) {
        return { type: 'channelId', value: channelIdMatch[1] };
    }

    // Handle /c/name or /user/name format
    const customMatch = url.match(/\/(c|user)\/([\w.-]+)/);
    if (customMatch) {
        return { type: 'custom', value: customMatch[2] };
    }

    // If it looks like a raw channel ID
    if (url.startsWith('UC') && url.length >= 24) {
        return { type: 'channelId', value: url };
    }

    // Fallback: treat as search query
    return { type: 'search', value: url };
}

/**
 * Resolve a channel identifier to channel details
 */
async function resolveChannel(identifier) {
    const apiKey = YOUTUBE_API_KEY();

    if (identifier.type === 'channelId') {
        const url = `${YT_API_BASE}/channels?part=contentDetails,snippet&id=${identifier.value}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items[0];
        }
        throw new Error('Channel not found');
    }

    if (identifier.type === 'handle') {
        // Try forHandle first
        const handleUrl = `${YT_API_BASE}/channels?part=contentDetails,snippet&forHandle=${identifier.value}&key=${apiKey}`;
        const handleResponse = await fetch(handleUrl);
        const handleData = await handleResponse.json();
        console.log(`[YouTube] forHandle response for ${identifier.value}:`, JSON.stringify(handleData).slice(0, 300));

        if (handleData.items && handleData.items.length > 0) {
            return handleData.items[0];
        }

        // Fallback to search API
        const searchUrl = `${YT_API_BASE}/search?part=snippet&q=@${identifier.value}&type=channel&maxResults=5&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        console.log(`[YouTube] search fallback response:`, JSON.stringify(searchData).slice(0, 300));

        if (searchData.items && searchData.items.length > 0) {
            const channelId = searchData.items[0].snippet.channelId;
            const channelUrl = `${YT_API_BASE}/channels?part=contentDetails,snippet&id=${channelId}&key=${apiKey}`;
            const channelResponse = await fetch(channelUrl);
            const channelData = await channelResponse.json();

            if (channelData.items && channelData.items.length > 0) {
                return channelData.items[0];
            }
        }

        throw new Error('Channel not found for handle @' + identifier.value);
    }

    if (identifier.type === 'custom') {
        // Search for the custom URL name
        const searchUrl = `${YT_API_BASE}/search?part=snippet&q=${identifier.value}&type=channel&maxResults=5&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.items && searchData.items.length > 0) {
            const channelId = searchData.items[0].snippet.channelId;
            const channelUrl = `${YT_API_BASE}/channels?part=contentDetails,snippet&id=${channelId}&key=${apiKey}`;
            const channelResponse = await fetch(channelUrl);
            const channelData = await channelResponse.json();

            if (channelData.items && channelData.items.length > 0) {
                return channelData.items[0];
            }
        }

        throw new Error('Channel not found for: ' + identifier.value);
    }

    if (identifier.type === 'search') {
        const searchUrl = `${YT_API_BASE}/search?part=snippet&q=${encodeURIComponent(identifier.value)}&type=channel&maxResults=5&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.items && searchData.items.length > 0) {
            const channelId = searchData.items[0].snippet.channelId;
            const channelUrl = `${YT_API_BASE}/channels?part=contentDetails,snippet&id=${channelId}&key=${apiKey}`;
            const channelResponse = await fetch(channelUrl);
            const channelData = await channelResponse.json();

            if (channelData.items && channelData.items.length > 0) {
                return channelData.items[0];
            }
        }

        throw new Error('No channel found for search: ' + identifier.value);
    }

    throw new Error('Unable to resolve channel');
}

/**
 * Fetch all video IDs from a playlist (paginated)
 */
async function fetchAllPlaylistItems(playlistId) {
    const apiKey = YOUTUBE_API_KEY();
    const videos = [];
    let nextPageToken = null;

    do {
        let url = `${YT_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}`;
        if (nextPageToken) {
            url += `&pageToken=${nextPageToken}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(`YouTube API error: ${data.error.message}`);
        }

        if (data.items) {
            for (const item of data.items) {
                const snippet = item.snippet;
                if (snippet.resourceId && snippet.resourceId.videoId) {
                    videos.push({
                        videoId: snippet.resourceId.videoId,
                        title: snippet.title,
                        publishedAt: snippet.publishedAt,
                    });
                }
            }
        }

        nextPageToken = data.nextPageToken || null;
    } while (nextPageToken);

    return videos;
}

/**
 * Batch fetch video statistics and duration (up to 50 per call)
 */
async function fetchVideoDetails(videoIds) {
    const apiKey = YOUTUBE_API_KEY();
    const details = {};

    // Process in batches of 50
    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const ids = batch.join(',');
        const url = `${YT_API_BASE}/videos?part=statistics,contentDetails&id=${ids}&key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.items) {
            for (const item of data.items) {
                details[item.id] = {
                    viewCount: item.statistics ? parseInt(item.statistics.viewCount || '0') : 0,
                    duration: item.contentDetails ? item.contentDetails.duration : null,
                };
            }
        }
    }

    return details;
}

// ─── Server-side transcript fetching ─────────────────────────────────────────

/**
 * Fetch transcript server-side using the ANDROID innertube client.
 * (Same approach as the youtube-transcript npm package)
 */
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const ANDROID_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' } };
const IOS_UA = 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)';
const IOS_CONTEXT = { client: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' } };
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function tryInnertubeClient(videoId, clientCtx, userAgent) {
    const resp = await pfetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
            body: JSON.stringify({ context: clientCtx, videoId }),
        }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 0) return tracks;
    // Log what YouTube returned for debugging
    const status = data?.playabilityStatus?.status;
    const reason = data?.playabilityStatus?.reason;
    console.log(`[YouTube] ${clientCtx.client.clientName} response: status=${status}, reason=${reason || 'none'}, hasCaptions=${!!data?.captions}`);
    return null;
}

async function fetchTranscriptServerSide(videoId) {
    // Try multiple innertube clients — datacenter IPs may get blocked on some
    const clients = [
        { context: { ...ANDROID_CONTEXT }, ua: ANDROID_UA, name: 'ANDROID' },
        { context: { ...IOS_CONTEXT }, ua: IOS_UA, name: 'IOS' },
    ];

    let tracks = null;
    for (const c of clients) {
        tracks = await tryInnertubeClient(videoId, { client: c.context.client || c.context }, c.ua);
        if (tracks) {
            console.log(`[YouTube] Got captions via ${c.name} client for ${videoId}`);
            break;
        }
    }

    if (!tracks) {
        throw new Error('No captions available for this video');
    }

    // Pick best track: prefer English, then first available
    const track =
        tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
        tracks.find((t) => t.languageCode?.startsWith('en')) ||
        tracks[0];

    // Step 2: Fetch timedtext XML from the caption track URL
    const timedtextResp = await pfetch(track.baseUrl, {
        headers: { 'User-Agent': WEB_UA },
    });

    if (!timedtextResp.ok) {
        throw new Error(`Timedtext returned ${timedtextResp.status}`);
    }

    const xml = await timedtextResp.text();
    if (!xml || xml.trim().length === 0) {
        throw new Error('Timedtext response was empty');
    }

    // Step 3: Parse XML — try <p t="" d=""> format first, fallback to <text start="" dur="">
    const lines = [];
    const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    const textRegex = /<text\s+start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

    let m;
    const regex = xml.includes('<p ') ? pRegex : textRegex;
    const isMs = xml.includes('<p '); // <p> format uses milliseconds, <text> uses seconds

    while ((m = regex.exec(xml)) !== null) {
        const startSec = isMs ? parseInt(m[1], 10) / 1000 : parseFloat(m[1]);

        // Extract text — handle <s> segments inside <p>
        let rawText = m[3];
        if (/<s[^>]*>/.test(rawText)) {
            let combined = '';
            const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
            let sm;
            while ((sm = sRegex.exec(rawText)) !== null) combined += sm[1];
            rawText = combined || rawText.replace(/<[^>]+>/g, '');
        }

        const text = rawText
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
            .replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
        if (!text) continue;

        const h = Math.floor(startSec / 3600);
        const mn = Math.floor((startSec % 3600) / 60);
        const s = Math.floor(startSec % 60);
        const ts = h > 0
            ? `[${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}]`
            : `[${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;

        lines.push(`${ts} ${text}`);
    }

    if (lines.length === 0) {
        throw new Error('Could not parse transcript XML');
    }

    return {
        transcript: lines.join('\n'),
        language: track.languageCode,
        isAutoGenerated: track.kind === 'asr',
    };
}

/**
 * POST /api/youtube/fetch-transcript
 * Server-side transcript extraction for a single video
 */
router.post('/fetch-transcript', requireAuth, async (req, res) => {
    try {
        const { videoId, duration: providedDuration } = req.body;
        if (!videoId) {
            return res.status(400).json({ error: 'videoId is required' });
        }

        // Get video metadata (title, channel, duration) via YouTube API
        let duration = providedDuration;
        let videoTitle = null;
        let videoChannelName = null;
        let videoChannelId = null;
        try {
            const metaUrl = `${YT_API_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY()}`;
            const metaRes = await fetch(metaUrl);
            const metaData = await metaRes.json();
            const item = metaData.items?.[0];
            if (item) {
                if (!duration) duration = item.contentDetails?.duration || null;
                videoTitle = item.snippet?.title || null;
                videoChannelName = item.snippet?.channelTitle || null;
                videoChannelId = item.snippet?.channelId || null;
            }
        } catch (err) {
            console.log(`[YouTube] Could not fetch metadata for ${videoId}: ${err.message}`);
        }

        // Calculate minutes to charge
        const minutesNeeded = duration
            ? Math.max(1, Math.ceil(parseDurationToSeconds(duration) / 60))
            : 1;

        // Check user has enough credit minutes
        const User = getUser();
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if ((user.creditMinutes ?? 0) < minutesNeeded) {
            return res.status(402).json({
                error: 'Insufficient credit minutes',
                minutesNeeded,
                minutesAvailable: user.creditMinutes ?? 0,
            });
        }

        console.log(`[YouTube] Fetching transcript server-side for: ${videoId}`);
        const result = await fetchTranscriptServerSide(videoId);
        console.log(`[YouTube] Got ${result.transcript.split('\n').length} lines for ${videoId}`);

        // Deduct minutes on successful extraction
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { creditMinutes: -minutesNeeded } },
            { new: true }
        );
        console.log(`[YouTube] Charged ${minutesNeeded} min for ${videoId} | Remaining: ${updatedUser.creditMinutes} min`);

        res.json({ ...result, minutesCharged: minutesNeeded, creditMinutesRemaining: updatedUser.creditMinutes, videoTitle, videoChannelName, videoChannelId, duration });
    } catch (error) {
        console.error(`[YouTube] Transcript fetch error:`, error.message);
        res.status(422).json({ error: error.message });
    }
});

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/youtube/channel-videos
 * Fetch all videos from a YouTube channel
 */
router.post('/channel-videos', requireAuth, async (req, res) => {
    try {
        const { channelUrl } = req.body;

        if (!channelUrl) {
            return res.status(400).json({ error: 'Channel URL is required' });
        }

        // Step 1: Extract channel identifier
        const identifier = extractChannelIdentifier(channelUrl);
        if (!identifier) {
            return res.status(400).json({ error: 'Invalid channel URL format' });
        }

        // Step 2: Resolve to channel details
        const channel = await resolveChannel(identifier);
        const channelId = channel.id;
        const channelName = channel.snippet.title;
        const channelProfilePictureUrl = channel.snippet.thumbnails?.default?.url || null;

        // Step 3: Get uploads playlist
        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) {
            return res.status(400).json({ error: 'Could not find uploads playlist for this channel' });
        }

        // Step 4: Fetch all playlist items
        const videos = await fetchAllPlaylistItems(uploadsPlaylistId);

        // Step 5: Batch fetch video details (stats + duration)
        const videoIds = videos.map((v) => v.videoId);
        const videoDetails = await fetchVideoDetails(videoIds);

        // Merge details into videos
        const enrichedVideos = videos.map((video) => {
            const details = videoDetails[video.videoId] || {};
            return {
                videoId: video.videoId,
                title: video.title,
                publishedAt: video.publishedAt,
                viewCount: details.viewCount || null,
                duration: details.duration || null,
            };
        });

        console.log(`[YouTube] Fetched ${enrichedVideos.length} videos for channel: ${channelName}`);

        res.json({
            channelName,
            channelId,
            channelProfilePictureUrl,
            videos: enrichedVideos,
        });
    } catch (error) {
        console.error('[YouTube] Channel videos error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to fetch channel videos' });
    }
});

/**
 * POST /api/youtube/save-individual
 * Save a single video transcript
 */
router.post('/save-individual', requireAuth, async (req, res) => {
    try {
        const {
            videoId,
            title,
            channelName,
            channelId,
            channelProfilePictureUrl,
            transcript,
            duration,
            viewCount,
            publishedAt,
        } = req.body;

        if (!videoId || !title) {
            return res.status(400).json({ error: 'Missing required fields: videoId, title' });
        }

        // Generate truncated transcript
        const truncatedTranscript = sampleTranscript(transcript, duration);

        // Save transcript (credits already charged on extraction)
        const Transcript = getTranscript();
        const transcriptDoc = await Transcript.create({
            user_id: req.user._id,
            channelId: channelId || 'unknown',
            channelName: channelName || 'Unknown',
            channelProfilePictureUrl: channelProfilePictureUrl || null,
            extractionType: 'individual',
            videos: [
                {
                    videoId,
                    title,
                    publishedAt: publishedAt || null,
                    viewCount: viewCount || null,
                    duration: duration || null,
                    transcript: transcript || null,
                    transcriptStatus: transcript ? 'success' : 'unavailable',
                    truncatedTranscript,
                    creditsCharged: 1,
                },
            ],
            stats: {
                totalVideos: 1,
                successCount: transcript ? 1 : 0,
                unavailableCount: transcript ? 0 : 1,
                totalCreditsCharged: 1,
            },
        });

        console.log(`[YouTube] Individual save: ${title}`);

        res.json({
            transcriptId: transcriptDoc._id,
        });
    } catch (error) {
        console.error('[YouTube] Save individual error:', error.message);
        res.status(500).json({ error: 'Failed to save transcript' });
    }
});

/**
 * POST /api/youtube/save-bulk
 * Save bulk channel transcripts
 */
router.post('/save-bulk', requireAuth, async (req, res) => {
    try {
        console.log('[DEBUG save-bulk] body keys:', Object.keys(req.body || {}), 'channelName:', req.body?.channelName, 'channelId:', req.body?.channelId, 'videos count:', req.body?.videos?.length);
        const {
            channelUrl,
            channelName,
            channelId,
            channelProfilePictureUrl,
            videos,
            stats,
        } = req.body;

        if (!channelName || !channelId || !videos || !Array.isArray(videos)) {
            return res.status(400).json({ error: 'Missing required fields: channelName, channelId, videos' });
        }

        // Credits already charged per-video during extraction (fetch-transcript)
        const processedVideos = videos.map((video) => {
            const minutesCharged = video.transcriptStatus === 'success'
                ? Math.max(1, Math.ceil(parseDurationToSeconds(video.duration) / 60))
                : 0;

            return {
                videoId: video.videoId,
                title: video.title,
                publishedAt: video.publishedAt || null,
                viewCount: video.viewCount || null,
                duration: video.duration || null,
                transcript: video.transcript || null,
                transcriptStatus: video.transcriptStatus || 'unavailable',
                truncatedTranscript: video.transcriptStatus === 'success'
                    ? sampleTranscript(video.transcript, video.duration)
                    : null,
                creditsCharged: minutesCharged,
            };
        });

        const totalMinutesCharged = processedVideos.reduce((sum, v) => sum + (v.creditsCharged || 0), 0);

        // Save transcript (no credit deduction here — already charged on extraction)
        const Transcript = getTranscript();
        const transcriptDoc = await Transcript.create({
            user_id: req.user._id,
            channelUrl: channelUrl || null,
            channelId,
            channelName,
            channelProfilePictureUrl: channelProfilePictureUrl || null,
            extractionType: 'bulk',
            videos: processedVideos,
            stats: {
                totalVideos: stats?.totalVideos || videos.length,
                successCount: stats?.successCount || processedVideos.filter((v) => v.transcriptStatus === 'success').length,
                unavailableCount: stats?.unavailableCount || processedVideos.filter((v) => v.transcriptStatus !== 'success').length,
                totalCreditsCharged: totalMinutesCharged,
            },
        });

        console.log(`[YouTube] Bulk save: ${channelName} | ${processedVideos.length} videos | ${totalMinutesCharged} min charged`);

        res.json({
            transcriptId: transcriptDoc._id,
        });
    } catch (error) {
        console.error('[YouTube] Save bulk error:', error.message);
        res.status(500).json({ error: 'Failed to save bulk transcripts' });
    }
});

/**
 * GET /api/youtube/usage-history
 * Get usage history with credit charges
 */
router.get('/usage-history', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcripts = await Transcript.find({ user_id: req.user._id })
            .select('channelName channelId extractionType stats created_at videos.title videos.creditsCharged videos.videoId')
            .sort({ created_at: -1 })
            .lean();

        const history = transcripts.map((t) => ({
            _id: t._id,
            channelName: t.channelName,
            channelId: t.channelId,
            extractionType: t.extractionType,
            videoCount: t.videos ? t.videos.length : 0,
            totalCreditsCharged: t.stats?.totalCreditsCharged || 0,
            date: t.created_at,
        }));

        res.json({ history });
    } catch (error) {
        console.error('[YouTube] Usage history error:', error.message);
        res.status(500).json({ error: 'Failed to fetch usage history' });
    }
});

module.exports = router;
