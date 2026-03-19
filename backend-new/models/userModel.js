const { getDB } = require('../config/database');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        picture: {
            type: String,
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true,
        },
        creditMinutes: {
            type: Number,
            default: 250,
        },
        clickedPurchase: {
            type: Boolean,
            default: false,
        },
        wantsToPayUSD: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

function getModel() {
    const db = getDB();
    if (!db) throw new Error('Database connection not available');
    try {
        return db.model('User');
    } catch (error) {
        return db.model('User', userSchema);
    }
}

module.exports = getModel;
