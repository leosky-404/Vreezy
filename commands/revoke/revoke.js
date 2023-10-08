const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, CommandInteraction } = require('discord.js');
const moment = require('moment');
const { writeFile } = require('fs');
const { join } = require('path');

const { errorLogger, criminalRecordLogger } = require('../../utils/factory/webhookClient');
const { blacklistDurations } = require('../../config.json');
const bsTags = require('../../databaseModels/saveTags');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('revoke')
        .setDescription('Revoke a user\'s access to the bot')
        .setDMPermission(false)
        .addSubcommand(subcommand => subcommand
            .setName('user')
            .setDescription('Revoke a user\'s access to the bot')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to revoke access to the bot')
                .setRequired(true))
            .addStringOption(option => option
                .setName('reason')
                .setDescription('The reason for revoking access to the bot')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('blacklist')
            .setDescription('Blacklist a user from using the bot')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to blacklist')
                .setRequired(true))
            .addStringOption(option => option
                .setName('duration')
                .setDescription('The duration of the blacklist')
                .setRequired(true)
                .addChoices(...blacklistDurations))
            .addStringOption(option => option
                .setName('reason')
                .setDescription('The reason for blacklisting the user')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('whitelist')
            .setDescription('Whitelist a user from using the bot')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to whitelist')
                .setRequired(true))),

    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const { member } = interaction;

        const subCommandGroup = interaction.options.getSubcommandGroup(false);
        const subCommand = interaction.options.getSubcommand(false);
        const commandName = interaction.commandName + (subCommandGroup ? ` ${subCommandGroup}` : '') + (subCommand ? ` ${subCommand}` : '');

        const hasPermission = member.permissions.has(PermissionFlagsBits.ModerateMembers);

        if (!hasPermission) {
            await interaction.reply({
                content: '❌ · You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'user') {
                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');

                const playerProfile = await bsTags.findOne({
                    userId: targetUser.id
                });

                if (!playerProfile) {
                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`**${targetUser.username}** does not have a profile saved.`);

                    return interaction.editReply({
                        embeds: [embed]
                    });
                }

                await bsTags.deleteOne({
                    userId: targetUser.id
                });

                const recordEmbed = new EmbedBuilder()
                    .setColor('DarkRed')
                    .setDescription(`**Command:** </${commandName}:${interaction.commandId}>\n**User:** ${targetUser} (${targetUser.id})\n**Moderator:** ${interaction.user} (${interaction.user.id})\n**Reason:** ${reason}`)
                    .setTimestamp();

                criminalRecordLogger.send({
                    username: `${interaction.client.user.username} | Criminal Record`,
                    avatarURL: interaction.client.user.displayAvatarURL(),
                    embeds: [recordEmbed]
                });

                await interaction.editReply({
                    content: `**${targetUser.username}**'s profile has been revoked for **${reason}**.`
                });

                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xCB35F9)
                        .setDescription(`Your profile has been revoked for **${reason}**.`);

                    await targetUser.send({
                        embeds: [dmEmbed]
                    });
                } catch (error) {
                    // Do nothing
                }
            } else if (subcommand === 'blacklist') {
                const targetUser = interaction.options.getUser('user');
                const durationStr = interaction.options.getString('duration');
                const reason = interaction.options.getString('reason');

                const { bannedUsers } = require('../../utils/jsonFiles/bannedUser.json');
                const duration = parseDuration(durationStr);
                const bannedUntilUnix = moment().add(duration, 'milliseconds').unix();

                const existingIndex = bannedUsers.findIndex(banned => banned.userId === targetUser.id);
                if (existingIndex !== -1) {
                    bannedUsers[existingIndex].bannedUntil = bannedUntilUnix;
                } else {
                    const bannedUser = {
                        userId: targetUser.id,
                        bannedUntil: bannedUntilUnix
                    };
                    bannedUsers.push(bannedUser);
                }

                const jsonFilePath = join(__dirname, '../../utils/jsonFiles/bannedUser.json');
                writeFile(jsonFilePath, JSON.stringify({ bannedUsers }), async (error) => {
                    if (error) {
                        const embed = new EmbedBuilder()
                            .setColor('Red')
                            .setDescription(`An error occurred whilte updating the blacklist.nError: \`${error.message}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

                        errorLogger.send({
                            username: `${interaction.client.user.username} | Error Logs`,
                            avatarURL: interaction.client.user.displayAvatarURL(),
                            embeds: [embed]
                        });

                        await interaction.editReply({
                            content: '❌ · An error occurred while updating the blacklist.'
                        });
                    }
                });

                const recordEmbed = new EmbedBuilder()
                    .setColor('DarkRed')
                    .setDescription(`**Command:** </${commandName}:${interaction.commandId}>\n**User:** ${targetUser} (${targetUser.id})\n**Moderator:** ${interaction.user} (${interaction.user.id})\n**Reason:** ${reason}\n**Duration:** ${durationStr}`)
                    .setTimestamp();

                criminalRecordLogger.send({
                    username: `${interaction.client.user.username} | Criminal Record`,
                    avatarURL: interaction.client.user.displayAvatarURL(),
                    embeds: [recordEmbed]
                });

                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xCB35F9)
                        .setDescription(`You have been blacklisted from using **${interaction.client.user.username}** until <t:${bannedUntilUnix}:f> for **${reason}**.`);

                    await targetUser.send({
                        embeds: [dmEmbed]
                    });
                } catch (error) {
                    // Do nothing
                }

                await interaction.editReply({
                    content: `**${targetUser.username}** has been blacklisted until <t:${bannedUntilUnix}:f> for **${reason}**.`
                });
            } else if (subcommand === 'whitelist') {
                const targetUser = interaction.options.getUser('user');
                const { bannedUsers } = require('../../utils/jsonFiles/bannedUser.json');
                const index = bannedUsers.findIndex(user => user.userId === targetUser.id);

                const jsonFilePath = join(__dirname, '../../utils/jsonFiles/bannedUser.json');
                if (index !== -1) {
                    bannedUsers.splice(index, 1);
                    writeFile(jsonFilePath, JSON.stringify({ bannedUsers }), (error) => {
                        if (error) {
                            const embed = new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`An error occurred whilte updating the blacklist.nError: \`${error.message}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

                            errorLogger.send({
                                username: `${interaction.client.user.username} | Error Logs`,
                                avatarURL: interaction.client.user.displayAvatarURL(),
                                embeds: [embed]
                            });

                            return interaction.editReply({
                                content: '❌ · An error occurred while updating the blacklist.'
                            });
                        }
                    });

                    const recordEmbed = new EmbedBuilder()
                        .setColor('DarkRed')
                        .setDescription(`**Command:** </${commandName}:${interaction.commandId}>\n**User:** ${targetUser} (${targetUser.id})\n**Moderator:** ${interaction.user} (${interaction.user.id})`)

                    criminalRecordLogger.send({
                        username: `${interaction.client.user.username} | Criminal Record`,
                        avatarURL: interaction.client.user.displayAvatarURL(),
                        embeds: [recordEmbed]
                    });

                    try {
                        const dmEmbed = new EmbedBuilder()
                            .setColor(0xCB35F9)
                            .setDescription(`You have been whitelisted from using **${interaction.client.user.username}**.`);

                        await targetUser.send({
                            embeds: [dmEmbed]
                        });
                    } catch (error) {
                        // Do nothing
                    }

                    await interaction.editReply({
                        content: `**${targetUser.username}** has been whitelisted.`
                    });
                } else {
                    await interaction.editReply({
                        content: `**${targetUser.username}** is not blacklisted.`
                    });
                }
            }
        } catch (error) {
            console.error(error);
            const errorMessage = error.message ? error.message : 'Unknown error';
            const webhookEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription(`Command: </${commandName}:${interaction.commandId}>\nError: \`${errorMessage}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

            errorLogger.send({
                username: `${interaction.client.user.username} | Error Logs`,
                avatarURL: interaction.client.user.displayAvatarURL(),
                embeds: [webhookEmbed]
            });
            await interaction.editReply('❌ · An error occurred while executing the command.');
        }
    }
}

function parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([smhdwM])$/);

    if (!match) {
        throw new Error('Invalid duration format. Please use a valid format like "30m", "1h", etc.');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's':
            return value * 1000;
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        case 'w':
            return value * 7 * 24 * 60 * 60 * 1000;
        case 'M':
            return value * 30 * 24 * 60 * 60 * 1000;
        default:
            throw new Error('Invalid time unit provided.');
    }
}