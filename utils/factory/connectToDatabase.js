const mongoose = require('mongoose');
const { mongoDBUri } = require('../../config.json');
const { GlobalFonts } = require('@napi-rs/canvas');
const { join } = require('path');

GlobalFonts.registerFromPath(join(__dirname, '../../assets/fonts/LilitaOne-Regular.ttf'), 'LilitaOne-Regular');
GlobalFonts.registerFromPath(join(__dirname, '../../assets/fonts/AppleColorEmoji.ttf'), 'AppleColorEmoji');
GlobalFonts.registerFromPath(join(__dirname, '../../assets/fonts/NotoSansJP-Bold.ttf'), 'NotoSans-JP-Bold');
GlobalFonts.registerFromPath(join(__dirname, '../../assets/fonts/NotoSans-Bold.ttf'), 'NotoSans-Bold');

async function connectToDatabase() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(mongoDBUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'Vreezy'
        });
        console.log('Connected to Database.');
    } catch (error) {
        console.error('Error connecting to database: ', error);
        process.exit(1);
    }
}

module.exports = { connectToDatabase };