const { WebhookClient } = require('discord.js');
const { webhooks: { profile, error, commands, criminalRecords } } = require('../../config.json');

const profileLogger = new WebhookClient({
    id: profile.id,
    token: profile.token
});

const errorLogger = new WebhookClient({
    id: error.id,
    token: error.token
});

const commandLogger = new WebhookClient({
    id: commands.id,
    token: commands.token
});

const criminalRecordLogger = new WebhookClient({
    id: criminalRecords.id,
    token: criminalRecords.token
})

module.exports = { profileLogger, errorLogger, commandLogger, criminalRecordLogger }