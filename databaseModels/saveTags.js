const { Schema, model } = require('mongoose');

const tagSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    playerTag: {
        type: String,
        required: true
    },
    powerLeagueRank: {
        type: Number,
        default: 0
    },
    score: {
        type: Number,
        required: true
    },
    lastRecordedBattleTime: {
        type: Number,
        default: 0
    },
    favouriteBrawler: {
        type: String,
        default: null
    },
    favouriteTheme: {
        type: String,
        default: null
    }
});

module.exports = model('playerTags', tagSchema);