require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectDB } = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const transcriptRoutes = require('./routes/transcriptRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Headers ───────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return callback(null, true);

            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:4000',
                'https://tubewhiz.win',
                'https://www.tubewhiz.win',
            ];

            // Allow chrome-extension:// origins
            if (origin.startsWith('chrome-extension://')) {
                return callback(null, true);
            }

            // Allow configured frontend URL
            if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Request Logging ────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
    });
    next();
});

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        name: 'TubeWhiz API',
        version: '1.0.0',
        status: 'running',
        environment: process.env.NODE_ENV || 'development',
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/transcripts', transcriptRoutes);

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────────────────────
async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n[Server] TubeWhiz API running on port ${PORT}`);
            console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`[Server] Health check: http://localhost:${PORT}/health\n`);
        });
    } catch (error) {
        console.error('[Server] Failed to start:', error.message);
        process.exit(1);
    }
}

startServer();
