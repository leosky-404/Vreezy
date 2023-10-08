const { SlashCommandBuilder, CommandInteraction, EmbedBuilder } = require('discord.js');
const { developers } = require('../../config.json');
const { version } = require('../../package.json');
const { errorLogger } = require('../../utils/factory/webhookClient.js');

/**
 * 
 * @param {number} uptimeSeconds
 * @returns 
 */
function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const formattedUptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    return formattedUptime;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Shows some information about the bot.')
        .setDMPermission(false),

    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        try {
            const client = interaction.client;

            const botName = client.user.username;
            const botAvatar = client.user.displayAvatarURL({ dynamic: true });

            const botDevelopers = developers.map(id => `<@${id}>`).join(', ');
            const uptime = formatUptime(client.uptime);
            const ping = client.ws.ping;
            const totalSystemMemory = Math.ceil(require('os').totalmem() / 1024 / 1024 / 1024)
            const memoryUsageRam = (process.memoryUsage().rss + process.memoryUsage().heapTotal) / 1024 / 1024; // RAM usage in MB
            const cpuUsage = process.cpuUsage().system / 1024 / 1024;
            const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

            const embed = new EmbedBuilder()
                .setColor(0xCB35F9)
                .setAuthor({ name: `${botName} Info`, iconURL: botAvatar })
                addFields(
                    { name: '👥 Developers', value: `┕ ${botDevelopers}`, inline: true },
                    { name: '⏳ Uptime', value: `┕ \`${uptime}\``, inline: true },
                    { name: '🏓 Ping', value: `┕ \`${ping} ms\``, inline: true },
                    { name: '🧮 RAM Usage', value: `┕ \`${memoryUsageRam.toFixed(2)} MB\/${totalSystemMemory.toFixed(2)} GB\``, inline: true },
                    { name: '💻 CPU Usage', value: `┕ \`${cpuUsage.toFixed(2)} %\``, inline: true },
                    { name: '👥 Total Members', value: `┕ \`${totalMembers}\``, inline: true }
                )
                .setFooter({ text: `Version: ${version}` });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const errorMessage = error.message ? error.message : 'Unknown error';
            const webhookEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription(`Command: </${interaction.commandName}:${interaction.commandId}>\nError: \`${errorMessage}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

            errorLogger.send({
                username: `${interaction.client.user.username} | Error Logs`,
                avatarURL: interaction.client.user.displayAvatarURL(),
                embeds: [webhookEmbed]
            });

            await interaction.reply('An error occurred while processing the command.');
        }
    }
};