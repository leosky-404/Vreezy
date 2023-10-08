const { SlashCommandBuilder, CommandInteraction, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, GuildMember, Client } = require('discord.js');

const { playerStats } = require('../../utils/factory/brawlStarsClient');
const bsTags = require('../../databaseModels/saveTags.js');
const { powerLeagueRanks, powerLeagueEmojis } = require('../../config.json');
const { profileLogger, errorLogger } = require('../../utils/factory/webhookClient');
const { allBrawlers } = require('../../utils/factory/getAllBrawlers');
const { themes, developers } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Set your favourite brawler')
        .setDMPermission(false)
        .addSubcommandGroup(subcommandGroup => subcommandGroup
            .setName('favourite')
            .setDescription('Set your favorite brawler')
            .addSubcommand(subcommand => subcommand
                .setName('brawler')
                .setDescription('Set your favourite brawler')
                .addStringOption(option => option
                    .setName('brawler')
                    .setDescription('The brawler you want to set as your favourite')
                    .setRequired(true)
                    .setAutocomplete(true)))
            .addSubcommand(subcommand => subcommand
                .setName('theme')
                .setDescription('Set your favourite theme')
                .addStringOption(option => option
                    .setName('theme')
                    .setDescription('The theme you want to set as your favourite')
                    .setRequired(true)
                    .addChoices(...themes))))
        .addSubcommand(subcommand => subcommand
            .setName('tag')
            .setDescription('Set your Brawl Stars tag.')
            .addStringOption(option => option
                .setName('tag')
                .setDescription('Your brawl stars tag')
                .setRequired(true))
            .addStringOption(option => option
                .setName('powerleague')
                .setDescription('Your highest solo power league rank')
                .setRequired(true)
                .addChoices(...powerLeagueRanks))
            .addAttachmentOption(option => option
                .setName('profile')
                .setDescription('Attach a screenshot of your profile')
                .setRequired(true))),

    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async autoComplete(interaction) {
        /**
         * @type {Array<{ brawlerId: number, brawlerName: string }>}
         */
        const brawlers = allBrawlers;

        const value = interaction.options.getFocused(true).value.toLowerCase();
        const choices = [];

        if (value === '') {
            for (const brawler of brawlers.slice(0, 10)) {
                choices.push({
                    name: brawler.brawlerName,
                    value: brawler.brawlerId.toString()
                });
            }
        } else {
            for (const brawler of brawlers) {
                if (choices.length >= 10) break;
                if (brawler.brawlerName.toLowerCase().includes(value)) {
                    choices.push({
                        name: brawler.brawlerName,
                        value: brawler.brawlerId.toString()
                    });
                }
            }
        }

        return interaction.respond(choices);
    },

    /**
     * 
     * @param {CommandInteraction} interaction 
     * @returns 
     */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        if (subcommand === 'tag') {
            await interaction.deferReply();

            const userTag = interaction.options.getString('tag')
                .replace(/#/g, '')
                .replace(/O/gi, '0')
                .toUpperCase();
            const powerLeagueRank = interaction.options.getString('powerleague');
            const profile = interaction.options.getAttachment('profile');

            try {
                const player = await playerStats(userTag);
                const { tag: playerTag, name: playerName, icon: { id: iconId } } = player;

                const existingProfile = await bsTags.findOne({
                    userId: user.id
                });

                if (existingProfile) {
                    const acceptButton = new ButtonBuilder()
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success)
                        .setCustomId('accept');

                    const cancelButton = new ButtonBuilder()
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setCustomId('cancel');

                    const buttonRow = new ActionRowBuilder()
                        .addComponents(acceptButton, cancelButton);

                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`⚠️ · **${user.username}**, you already have a profile saved. Do you want to overwrite it?`)
                        .setFooter({ text: 'This message will expire in 30 seconds.' });

                    const replyInteraction = await interaction.editReply({
                        embeds: [embed],
                        components: [buttonRow]
                    });

                    const filter = (interaction) => interaction.user.id === user.id;

                    const collector = replyInteraction.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        filter: filter,
                        time: 30000
                    });

                    collector.on('collect', async (buttonInteraction) => {
                        if (buttonInteraction.customId === 'accept') {
                            collector.stop();

                            existingProfile.playerTag = playerTag;
                            existingProfile.powerLeagueRank = powerLeagueRank;
                            existingProfile.score = powerLeagueRank * 100;

                            await existingProfile.save();

                            const embed = new EmbedBuilder()
                                .setColor(0xCB35F9)
                                .setAuthor({ name: `${playerName} | ${playerTag}`, iconURL: `https://cdn.brawlify.com/profile/${iconId}.png` })
                                .setDescription(`✅ · **${user.username}**, your profile has been updated.`)

                            await replyInteraction.edit({
                                embeds: [embed],
                                components: []
                            });

                            await sendProfileImage(user, interaction.client, profile, playerTag, powerLeagueRank);
                        }

                        if (buttonInteraction.customId === 'cancel') {
                            collector.stop();

                            const embed = new EmbedBuilder()
                                .setColor(0xCB35F9)
                                .setDescription(`❌ · **${user.username}**, your profile has not been updated.`)

                            await replyInteraction.edit({
                                embeds: [embed],
                                components: []
                            });
                        }
                    });

                    collector.on('end', async () => {
                        acceptButton.setDisabled(true);
                        cancelButton.setDisabled(true);

                        await replyInteraction.edit({
                            components: [buttonRow]
                        });
                    });
                } else {
                    const newProfile = new bsTags({
                        userId: user.id,
                        playerTag: playerTag,
                        powerLeagueRank: powerLeagueRank,
                        score: powerLeagueRank * 100
                    });

                    await newProfile.save();

                    const embed = new EmbedBuilder()
                        .setColor(0xCB35F9)
                        .setAuthor({ name: `${playerName} | ${playerTag}`, iconURL: `https://cdn.brawlify.com/profile/${iconId}.png` })
                        .setDescription(`✅ · **${user.username}**, your profile has been saved.`)

                    await interaction.editReply({
                        embeds: [embed]
                    });

                    await sendProfileImage(user, interaction.client, profile, playerTag, powerLeagueRank);
                }
            } catch (error) {
                const errorMessage = error.message ? error.message : 'Unknown error';

                const subCommandGroup = interaction.options.getSubcommandGroup(false);
                const subCommand = interaction.options.getSubcommand(false);
                const commandName = interaction.commandName + (subCommandGroup ? ` ${subCommandGroup}` : '') + (subCommand ? ` ${subCommand}` : '');

                const webhookEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`Command: </${commandName}:${interaction.commandId}>\nError: \`${errorMessage}\`\nStack Trace: \`\`\`${error.stack}\`\`\``)

                errorLogger.send({
                    username: `${interaction.client.user.username} | Error Logs`,
                    avatarURL: interaction.client.user.displayAvatarURL(),
                    embeds: [webhookEmbed]
                });

                const errorMessages = {
                    400: '⚠️ · **Oops! Something went wrong.** It seems there was an issue with the information you provided.',
                    403: '⚠️ · **Sorry, you don\'t have access to this feature right now.** It\'s not your fault; it\'s a problem with our system.',
                    404: '⚠️ · **Uh-oh! The tag you entered doesn\'t seem to exist.** Please double-check and try again.',
                    429: '⚠️ · **Hold on! We\'re experiencing high traffic right now.** Too many requests are coming in at once, so please try again later.',
                    503: '⚠️ · **We\'re sorry, but we can\'t access the data you need at the moment.** The game is undergoing maintenance. Please check back later.',
                    default: '**Oops! Something unexpected happened.** Our team is working to fix the issue. Please try again later or contact support for assistance.',
                };

                const { code } = error;
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(errorMessages[code] || errorMessages.default);

                await interaction.editReply({
                    embeds: [embed]
                });
            }
        }

        if (subcommand === 'brawler') {
            await interaction.deferReply();

            const brawlerId = parseInt(interaction.options.getString('brawler'));
            const brawlers = allBrawlers;
            const brawlerObject = brawlers.find(
                brawler => brawler.brawlerId === brawlerId
            );

            if (!brawlerObject) {
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ **${interaction.options.getString('brawler')}** is not a valid brawler.`);

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            try {
                const existingProfile = await bsTags.findOne({
                    userId: user.id
                });

                if (!existingProfile) {
                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`❌ You don't have a tag saved. Use \`/save\` to save your tag.`);

                    return interaction.editReply({
                        embeds: [embed]
                    });
                }

                const playerTag = existingProfile.playerTag;
                const { brawlers: playerBrawlers } = await playerStats(playerTag);

                const brawler = playerBrawlers.find(
                    brawler => brawler.id === brawlerId
                )

                if (!brawler) {
                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`❌ You don't have **${brawlerObject.brawlerName}** unlocked.`);

                    return interaction.editReply({
                        embeds: [embed]
                    });
                }

                existingProfile.favouriteBrawler = brawlerId;

                await existingProfile.save();

                const embed = new EmbedBuilder()
                    .setColor(0xCB35F9)
                    .setDescription(`✅ · **${user.username}**, your favorite brawler has been updated.`);

                await interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {
                const errorMessage = error.message ? error.message : 'Unknown error';
                const webhookEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`Command: </${interaction.commandName} favorite brawler:${interaction.commandId}>\nError: \`${errorMessage}\`\nStack Trace: \`\`\`${error.stack}\`\`\``);

                errorLogger.send({
                    username: `${interaction.client.user.username} | Error Logs`,
                    avatarURL: interaction.client.user.displayAvatarURL(),
                    embeds: [webhookEmbed]
                });
            }
        }

        if (subcommand === 'theme') {
            await interaction.deferReply();
            const theme = interaction.options.getString('theme');
            const { member } = interaction

            try {
                const profile = await bsTags.findOne({
                    userId: user.id
                });

                if (!profile) {
                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`❌ · You don't have a tag saved. </${interaction.commandName} tag:${interaction.commandId}> to save your tag.`);

                    return await interaction.editReply({
                        embeds: [embed]
                    });
                }

                if (!developers.includes(member.id) && !member.premiumSinceTimestamp) {
                    const embed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`❌ · Only developers and server boosters can use this command.`);

                    return await interaction.editReply({
                        embeds: [embed]
                    });
                }

                profile.favouriteTheme = theme;
                await profile.save();

                const themeName = themes[parseInt(theme)].name;
                const embed = new EmbedBuilder()
                    .setColor(0xCB35F9)
                    .setDescription(`✅ · **${user.username}**, your favourite theme has been updated to **${themeName}**.`);

                await interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {

            }
        }
    },
}

/**
 * 
 * @param {GuildMember} user 
 * @param {Client} client 
 */
async function sendProfileImage(user, client, profile, playerTag, powerLeagueRank) {
    const attachment = new AttachmentBuilder(profile.url, { name: 'profile.png' });

    const embed = new EmbedBuilder()
        .setColor(0xCB35F9)
        .setAuthor({ name: `${user.username}'s profile`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setImage('attachment://profile.png')
        .addFields(
            { name: 'User', value: `${user}`, inline: true },
            { name: 'Tag', value: playerTag, inline: true },
            { name: 'Power League Rank', value: powerLeagueEmojis[powerLeagueRank], inline: true }
        )
        .setFooter({ text: user.id })
        .setTimestamp();

    await profileLogger.send({
        username: `${client.user.username} | Profile Logs`,
        avatarURL: client.user.displayAvatarURL(),
        embeds: [embed],
        files: [attachment]
    });
}