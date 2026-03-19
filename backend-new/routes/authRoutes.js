const express = require('express');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/requireAuth');
const getUser = require('../models/userModel');

const router = express.Router();

/**
 * POST /api/auth/google
 * Google OAuth token verification - receives access token from extension
 */
router.post('/google', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Google access token is required' });
        }

        // Verify token with Google userinfo endpoint
        const googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!googleResponse.ok) {
            const errorText = await googleResponse.text();
            console.error('[Auth] Google userinfo error:', errorText);
            return res.status(401).json({ error: 'Invalid Google token' });
        }

        const googleUser = await googleResponse.json();
        const { sub, email, name, picture } = googleUser;

        if (!email) {
            return res.status(400).json({ error: 'Email not provided by Google' });
        }

        // Find or create user
        const User = getUser();
        const user = await User.findOneAndUpdate(
            { googleId: sub },
            {
                name: name || email.split('@')[0],
                email,
                picture,
                googleId: sub,
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        // Generate JWT
        const jwtToken = jwt.sign(
            { _id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log(`[Auth] User authenticated: ${email}`);

        res.json({
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
                creditMinutes: user.creditMinutes,
            },
            token: jwtToken,
        });
    } catch (error) {
        console.error('[Auth] Google auth error:', error.message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * POST /api/auth/dev
 * Development login bypass - ONLY available in non-production
 */
router.post('/dev', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }

    try {
        const User = getUser();
        const user = await User.findOneAndUpdate(
            { email: 'dev@tubewhiz.test' },
            {
                name: 'Dev User',
                email: 'dev@tubewhiz.test',
                picture: null,
                googleId: 'dev-google-id-12345',
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        const jwtToken = jwt.sign(
            { _id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log('[Auth] Dev user authenticated');

        res.json({
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
                creditMinutes: user.creditMinutes,
            },
            token: jwtToken,
        });
    } catch (error) {
        console.error('[Auth] Dev auth error:', error.message);
        res.status(500).json({ error: 'Dev authentication failed' });
    }
});

/**
 * GET /api/auth/profile
 * Get current user profile
 */
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const User = getUser();
        const user = await User.findById(req.user._id).select('-__v');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            picture: user.picture,
            creditMinutes: user.creditMinutes,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error('[Auth] Profile error:', error.message);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * POST /api/auth/purchase-intent
 * Record that the user clicked "Proceed to Checkout"
 */
router.post('/purchase-intent', requireAuth, async (req, res) => {
    try {
        const { totalUSD } = req.body || {};
        const User = getUser();
        const update = { $set: { clickedPurchase: true } };
        if (typeof totalUSD === 'number' && totalUSD > 0) {
            update.$inc = { wantsToPayUSD: totalUSD };
        }
        await User.findByIdAndUpdate(req.user._id, update);
        console.log(`[Auth] Purchase intent recorded for user ${req.user._id} (totalUSD: ${totalUSD || 0})`);
        res.json({ success: true });
    } catch (error) {
        console.error('[Auth] Purchase intent error:', error.message);
        res.status(500).json({ error: 'Failed to record purchase intent' });
    }
});

module.exports = router;
