const mongoose = require('mongoose');
require('dotenv').config();

// Log the environment variable directly to check for issues
console.log(`Environment MONGODB_URI: ${process.env.MONGODB_URI}`);

// MongoDB connection URL; use the one from the environment variables if available, otherwise fallback to the local one
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://0.0.0.0:27017/chat_app';

// Log the URI to be used
console.log(`Connecting to MongoDB using URI: ${MONGODB_URI}`);

// Function to connect to the MongoDB database
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB server connected successfully');
    } catch (err) {
        console.error('MongoDB connection error', err);
    }
};

// Event listeners for the MongoDB connection
const db = mongoose.connection;

db.on('disconnected', () => {
    console.log('MongoDB server disconnected !!');
});

module.exports = connectDB;
