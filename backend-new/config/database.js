const mongoose = require('mongoose');

let dbConnection = null;

async function connectDB() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        dbConnection = await mongoose.createConnection(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }).asPromise();

        console.log('[Database] MongoDB connected successfully');
        console.log(`[Database] Host: ${dbConnection.host}`);
        console.log(`[Database] Database: ${dbConnection.name}`);

        dbConnection.on('error', (err) => {
            console.error('[Database] Connection error:', err.message);
        });

        dbConnection.on('disconnected', () => {
            console.warn('[Database] MongoDB disconnected');
        });

        return dbConnection;
    } catch (error) {
        console.error('[Database] Failed to connect to MongoDB:', error.message);
        throw error;
    }
}

function getDB() {
    return dbConnection;
}

module.exports = { connectDB, getDB };
