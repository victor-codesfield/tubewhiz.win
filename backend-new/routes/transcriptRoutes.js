const express = require('express');
const OpenAI = require('openai');
const requireAuth = require('../middleware/requireAuth');
const getTranscript = require('../models/transcriptModel');

const router = express.Router();

// Lazy-init OpenAI client
let openaiClient = null;
function getOpenAI() {
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiClient;
}

// ─── List Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/transcripts/individual
 * List individual transcripts for the current user
 */
router.get('/individual', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcripts = await Transcript.find({
            user_id: req.user._id,
            extractionType: 'individual',
        })
            .select('channelName channelId channelProfilePictureUrl videos.videoId videos.title videos.publishedAt videos.viewCount videos.duration videos.transcriptStatus videos.creditsCharged stats created_at')
            .sort({ created_at: -1 })
            .lean();

        res.json({ transcripts });
    } catch (error) {
        console.error('[Transcripts] List individual error:', error.message);
        res.status(500).json({ error: 'Failed to fetch transcripts' });
    }
});

/**
 * GET /api/transcripts/bulk
 * List bulk transcripts for the current user
 */
router.get('/bulk', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcripts = await Transcript.find({
            user_id: req.user._id,
            extractionType: 'bulk',
        })
            .select('channelName channelId channelUrl channelProfilePictureUrl videos.videoId videos.title videos.publishedAt videos.viewCount videos.duration videos.transcriptStatus videos.creditsCharged stats created_at')
            .sort({ created_at: -1 })
            .lean();

        res.json({ transcripts });
    } catch (error) {
        console.error('[Transcripts] List bulk error:', error.message);
        res.status(500).json({ error: 'Failed to fetch transcripts' });
    }
});

// ─── Detail Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/transcripts/:id
 * Get specific transcript with full details
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcript = await Transcript.findOne({
            _id: req.params.id,
            user_id: req.user._id,
        }).lean();

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }

        // Auto-fix placeholder titles ("Video {videoId}") by looking up real metadata
        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
        if (YOUTUBE_API_KEY && transcript.videos?.length) {
            const needsFix = transcript.videos.filter(
                (v) => v.title && /^Video [a-zA-Z0-9_-]+$/.test(v.title)
            );
            if (needsFix.length > 0) {
                try {
                    const ids = needsFix.map((v) => v.videoId).join(',');
                    const metaRes = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${YOUTUBE_API_KEY}`
                    );
                    const metaData = await metaRes.json();
                    const updates = {};
                    for (const item of metaData.items || []) {
                        updates[item.id] = {
                            title: item.snippet?.title,
                            channelName: item.snippet?.channelTitle,
                            channelId: item.snippet?.channelId,
                        };
                    }
                    // Patch the response and update DB in background
                    let changed = false;
                    for (const v of transcript.videos) {
                        const u = updates[v.videoId];
                        if (u && u.title) {
                            v.title = u.title;
                            changed = true;
                        }
                    }
                    if (changed) {
                        // Update channelName/channelId if they were 'unknown'/'Unknown'
                        const firstUpdate = Object.values(updates)[0];
                        const channelPatch = {};
                        if (transcript.channelName === 'Unknown' && firstUpdate?.channelName) {
                            transcript.channelName = firstUpdate.channelName;
                            channelPatch.channelName = firstUpdate.channelName;
                        }
                        if (transcript.channelId === 'unknown' && firstUpdate?.channelId) {
                            transcript.channelId = firstUpdate.channelId;
                            channelPatch.channelId = firstUpdate.channelId;
                        }
                        // Fire-and-forget DB update
                        Transcript.updateOne(
                            { _id: transcript._id },
                            {
                                $set: {
                                    ...channelPatch,
                                    videos: transcript.videos,
                                },
                            }
                        ).catch((err) => console.error('[Transcripts] Auto-fix title error:', err.message));
                    }
                } catch (err) {
                    console.log('[Transcripts] Could not auto-fix titles:', err.message);
                }
            }
        }

        res.json({ transcript });
    } catch (error) {
        console.error('[Transcripts] Get detail error:', error.message);
        res.status(500).json({ error: 'Failed to fetch transcript' });
    }
});

/**
 * DELETE /api/transcripts/:id
 * Delete a transcript (verify ownership)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcript = await Transcript.findOneAndDelete({
            _id: req.params.id,
            user_id: req.user._id,
        });

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found or not authorized' });
        }

        console.log(`[Transcripts] Deleted transcript: ${req.params.id}`);
        res.json({ message: 'Transcript deleted successfully' });
    } catch (error) {
        console.error('[Transcripts] Delete error:', error.message);
        res.status(500).json({ error: 'Failed to delete transcript' });
    }
});

/**
 * GET /api/transcripts/:id/download
 * Download transcript as TXT file
 */
router.get('/:id/download', requireAuth, async (req, res) => {
    try {
        const Transcript = getTranscript();
        const transcript = await Transcript.findOne({
            _id: req.params.id,
            user_id: req.user._id,
        }).lean();

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }

        // Build TXT content
        let content = `Channel: ${transcript.channelName}\n`;
        content += `Channel ID: ${transcript.channelId}\n`;
        content += `Extraction Type: ${transcript.extractionType}\n`;
        content += `Date: ${new Date(transcript.created_at).toISOString()}\n`;
        content += `${'='.repeat(60)}\n\n`;

        for (const video of transcript.videos) {
            content += `Title: ${video.title}\n`;
            content += `Video ID: ${video.videoId}\n`;
            content += `Published: ${video.publishedAt ? new Date(video.publishedAt).toISOString() : 'N/A'}\n`;
            content += `Views: ${video.viewCount != null ? video.viewCount.toLocaleString() : 'N/A'}\n`;
            content += `Duration: ${video.duration || 'N/A'}\n`;
            content += `Status: ${video.transcriptStatus}\n`;
            content += `${'-'.repeat(40)}\n`;

            if (video.transcript) {
                content += `${video.transcript}\n`;
            } else {
                content += '[Transcript not available]\n';
            }

            content += `\n${'='.repeat(60)}\n\n`;
        }

        const filename = `${transcript.channelName.replace(/[^a-zA-Z0-9]/g, '_')}_transcripts.txt`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (error) {
        console.error('[Transcripts] Download error:', error.message);
        res.status(500).json({ error: 'Failed to download transcript' });
    }
});

// ─── AI Chat Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/transcripts/:id/chat
 * AI chat with cached summary approach
 */
router.post('/:id/chat', requireAuth, async (req, res) => {
    try {
        const { message, videoId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const Transcript = getTranscript();
        const transcript = await Transcript.findOne({
            _id: req.params.id,
            user_id: req.user._id,
        });

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }

        // Find the specific video
        let video;
        if (videoId) {
            video = transcript.videos.find((v) => v.videoId === videoId);
        } else {
            video = transcript.videos[0];
        }

        if (!video) {
            return res.status(404).json({ error: 'Video not found in transcript' });
        }

        const openai = getOpenAI();

        // CACHED SUMMARY APPROACH
        let cachedSummary = video.cachedSummary;

        if (!cachedSummary) {
            // Generate summary from transcript
            const contextText = video.truncatedTranscript || video.transcript;

            if (!contextText) {
                return res.status(400).json({ error: 'No transcript available for this video' });
            }

            const summaryResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes video transcripts. Provide a comprehensive summary.',
                    },
                    {
                        role: 'user',
                        content: `Summarize this video transcript in 500-800 words, covering all key topics, arguments, and conclusions:\n\n${contextText}`,
                    },
                ],
                max_tokens: 1200,
                temperature: 0.5,
            });

            cachedSummary = summaryResponse.choices[0]?.message?.content || '';

            // Save cached summary
            video.cachedSummary = cachedSummary;
            await transcript.save();
        }

        // Build messages array
        const systemPrompt = `You are an AI assistant helping users understand a YouTube video. You have a comprehensive summary of the video content. Use this summary to answer questions accurately and helpfully.

Format your responses using Markdown for readability:
- Use **bold** for key terms
- Use bullet points and numbered lists where appropriate
- Use headers (##) for organizing longer responses
- Keep responses concise but thorough

Video Title: "${video.title}"

Video Summary:
${cachedSummary}`;

        const messages = [{ role: 'system', content: systemPrompt }];

        // Add last 6 chat messages from history
        if (video.chatMessages && video.chatMessages.length > 0) {
            const recentMessages = video.chatMessages.slice(-6);
            for (const msg of recentMessages) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        // Add the user's new message
        messages.push({ role: 'user', content: message });

        // Call OpenAI
        const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 800,
            temperature: 0.7,
        });

        const assistantMessage = chatResponse.choices[0]?.message?.content || 'I was unable to generate a response.';

        // Save user message + assistant response to chat history
        video.chatMessages.push(
            { role: 'user', content: message, created_at: new Date() },
            { role: 'assistant', content: assistantMessage, created_at: new Date() }
        );
        await transcript.save();

        res.json({ message: assistantMessage });
    } catch (error) {
        console.error('[Transcripts] Chat error:', error.message);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

/**
 * GET /api/transcripts/:id/chat/history
 * Get chat history for a video
 */
router.get('/:id/chat/history', requireAuth, async (req, res) => {
    try {
        const { videoId } = req.query;

        const Transcript = getTranscript();
        const transcript = await Transcript.findOne({
            _id: req.params.id,
            user_id: req.user._id,
        }).lean();

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }

        let video;
        if (videoId) {
            video = transcript.videos.find((v) => v.videoId === videoId);
        } else {
            video = transcript.videos[0];
        }

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json({ chatMessages: video.chatMessages || [] });
    } catch (error) {
        console.error('[Transcripts] Chat history error:', error.message);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

/**
 * POST /api/transcripts/:id/suggestions
 * Generate question suggestions using first 2000 chars of transcript
 */
router.post('/:id/suggestions', requireAuth, async (req, res) => {
    try {
        const { videoId } = req.body;

        const Transcript = getTranscript();
        const transcript = await Transcript.findOne({
            _id: req.params.id,
            user_id: req.user._id,
        }).lean();

        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }

        let video;
        if (videoId) {
            video = transcript.videos.find((v) => v.videoId === videoId);
        } else {
            video = transcript.videos[0];
        }

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const contextSnippet = (video.truncatedTranscript || video.transcript || '').substring(0, 2000);

        if (!contextSnippet) {
            return res.json({ suggestions: ['What is this video about?', 'What are the main points?', 'Can you summarize the key takeaways?'] });
        }

        const openai = getOpenAI();
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Generate exactly 3 short, interesting questions a viewer might ask about this video. Return only the questions, one per line, without numbering or bullet points.',
                },
                {
                    role: 'user',
                    content: `Video: "${video.title}"\n\nTranscript excerpt:\n${contextSnippet}`,
                },
            ],
            max_tokens: 200,
            temperature: 0.8,
        });

        const suggestionsText = response.choices[0]?.message?.content || '';
        const suggestions = suggestionsText
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 3);

        res.json({ suggestions });
    } catch (error) {
        console.error('[Transcripts] Suggestions error:', error.message);
        res.status(500).json({ error: 'Failed to generate suggestions' });
    }
});

module.exports = router;
