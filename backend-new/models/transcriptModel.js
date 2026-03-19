const { getDB } = require('../config/database');
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const videoSubdocSchema = new mongoose.Schema(
    {
        videoId: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        publishedAt: {
            type: Date,
        },
        viewCount: {
            type: Number,
            default: null,
        },
        duration: {
            type: String,
        },
        transcript: {
            type: String,
            default: null,
        },
        transcriptStatus: {
            type: String,
            enum: ['success', 'unavailable', 'error'],
            default: 'unavailable',
        },
        truncatedTranscript: {
            type: String,
            default: null,
        },
        cachedSummary: {
            type: String,
            default: null,
        },
        creditsCharged: {
            type: Number,
            default: 1,
        },
        chatMessages: [chatMessageSchema],
    },
    { _id: true }
);

const transcriptSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        channelUrl: {
            type: String,
        },
        channelId: {
            type: String,
            required: true,
        },
        channelName: {
            type: String,
            required: true,
        },
        channelProfilePictureUrl: {
            type: String,
            default: null,
        },
        extractionType: {
            type: String,
            enum: ['individual', 'bulk'],
            default: 'individual',
        },
        videos: [videoSubdocSchema],
        stats: {
            totalVideos: { type: Number, default: 0 },
            successCount: { type: Number, default: 0 },
            unavailableCount: { type: Number, default: 0 },
            totalCreditsCharged: { type: Number, default: 0 },
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

transcriptSchema.index({ user_id: 1, created_at: -1 });

function getModel() {
    const db = getDB();
    if (!db) throw new Error('Database connection not available');
    try {
        return db.model('Transcript');
    } catch (error) {
        return db.model('Transcript', transcriptSchema);
    }
}

module.exports = getModel;
