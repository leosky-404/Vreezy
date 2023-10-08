const { Events, EmbedBuilder } = require('discord.js');
const { errorLogger } = require('../../utils/factory/webhookClient');
const { client } = require('../../index.js');

module.exports = {
    name: Events.Error,
    once: false,

    execute(error) {
        const errorMessage = error.message? error.message : 'Unknown error';
        const embed = new EmbedBuilder()
            .setColor('Red')
            .setDescription(`Location: client.on('error')\nError: \`${errorMessage}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

        errorLogger.send({
            username: `${client.user.username} | Error Logger`,
            avatarURL: client.user.displayAvatarURL({ dynamic: true }),
            embeds: [embed]
        });
    }
}