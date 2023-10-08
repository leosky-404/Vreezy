const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Canvas, loadImage } = require('@napi-rs/canvas');
const emojiRegex = require('emoji-regex');
const { join } = require('path');
const { access } = require('fs');

const { playerStats } = require('../../utils/factory/brawlStarsClient.js');
const { allBrawlers } = require('../../utils/factory/getAllBrawlers');
const { errorLogger } = require('../../utils/factory/webhookClient');
const bsTags = require('../../databaseModels/saveTags');
const { brawlerPanelStartingX, brawlerPanelStartingY, playerIconStartingX, playerIconStartingY, playerIconHeightAndWidth, fontSize, brawlersUnlockedStartingX, brawlersUnlockedStartingY, brawlersUnlockedEndingX, brawlersUnlockedEndingY, namesStartingX, playerNameStartingY, clubNameStartingY, numColumns, numRows, cellGap, brawlerIconCellWidth, brawlerIconCellHeight } = require('../../utils/jsonFiles/brawlerCardVariables.json');
const { version } = require('../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('brawlers')
        .setDescription('Check your\'s or another player\'s top 30 Brawlers')
        .setDMPermission(false)
        .addUserOption(option => option
            .setName('user')
            .setDescription('Mention a user')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('user') || interaction.user;
        const { id: userId } = user;
        const isSelf = userId === interaction.user.id;

        let profile;

        try {
            profile = await bsTags.findOne({
                userId: userId
            });

            if (!profile) {
                const setCommandId = await interaction.client.application.commands.fetch().then(
                    commands => commands.find(command => command.name === 'set').id
                );

                const description = isSelf
                    ? `⚠️ · You don't have a profile saved. Use </set tag:${setCommandId}> to save your profile and then try again.`
                    : `⚠️ · ${user} does not have a profile saved.`;
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(description)

                return await interaction.editReply({
                    embeds: [embed]
                });
            }

            const player = await playerStats(profile.playerTag);
            const { brawlers, name: playerName, club: { name: clubName = 'No Club' }, icon: { id: iconId } } = player;
            brawlers.sort((a, b) => b.rank - a.rank);

            const canvas = new Canvas(1920, 1080);
            const context = canvas.getContext('2d');
            const brawlerUnlocked = `${brawlers.length} / ${allBrawlers.length}`;

            const background = await loadImage(join(__dirname, '../../assets/otherAssets/4.png'));
            const brawlerPanel = await loadImage(join(__dirname, '../../assets/otherAssets/5.png'));
            const playerIcon = await loadAndFallbackImage('../../assets/playerIcons', `${iconId}.png`, '0.png');

            context.drawImage(background, 0, 0, 1920, 1080);
            context.drawImage(brawlerPanel, 0, 0, 1920, 1080);
            context.drawImage(playerIcon, playerIconStartingX, playerIconStartingY, playerIconHeightAndWidth, playerIconHeightAndWidth);

            drawName(playerName, playerNameStartingY, true, context);
            drawName(clubName, clubNameStartingY, true, context);

            context.font = `${fontSize}px LilitaOne-Regular`;
            context.fillStyle = 'rgba(255, 255, 255)';
            context.fillText(brawlerUnlocked, brawlersUnlockedStartingX + ((brawlersUnlockedEndingX - brawlersUnlockedStartingX) / 2) - (context.measureText(brawlerUnlocked).width / 2), brawlersUnlockedStartingY + ((brawlersUnlockedEndingY - brawlersUnlockedStartingY) / 2) + (fontSize / 2));

            let index = 0;

            for (let row = 0; row < numRows; row++) {
                for (let column = 0; column < numColumns; column++) {
                    if (index >= 30) {
                        break;
                    }

                    const brawler = brawlers[index];
                    const { id: brawlerId, rank } = brawler;

                    const brawlerIcon = await loadAndFallbackImage('../../assets/brawlerIcons', `${brawlerId}.png`, '0.png');
                    const rankIcon = await loadImage(join(__dirname, `../../assets/rankIconBackgrounds/${rank}.png`));

                    context.drawImage(await loadImage(rankIcon), brawlerPanelStartingX + (column * brawlerIconCellWidth) + ((column + 1) * cellGap), brawlerPanelStartingY + (row * brawlerIconCellHeight) + ((row + 1) * cellGap), brawlerIconCellWidth, brawlerIconCellHeight);
                    context.drawImage(await loadImage(brawlerIcon), brawlerPanelStartingX + (column * brawlerIconCellWidth) + ((column + 1) * cellGap), brawlerPanelStartingY + (row * brawlerIconCellHeight) + ((row + 1) * cellGap), brawlerIconCellWidth, brawlerIconCellHeight);

                    index++;
                }
            }

            const waterMark = `Vreezy v${version}`;
            context.font = '45px LilitaOne-Regular';
            context.fillStyle = 'rgba(255, 255, 255, 0.25)';
            context.fillText(waterMark, 1920 - context.measureText(waterMark).width - 48, brawlersUnlockedStartingY + ((brawlersUnlockedEndingY - brawlersUnlockedStartingY) / 2) + (fontSize / 2) + 82.5);

            const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'brawlers.png' });

            await interaction.editReply({
                files: [attachment]
            });
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
}

async function loadAndFallbackImage(directory, fileName, fallbackFileName) {
    const imagePath = join(__dirname, directory, fileName);
    const fallbackImagePath = join(__dirname, directory, fallbackFileName);

    const imageExists = await new Promise((resolve) => {
        access(imagePath, (error) => {
            if (error) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });

    if (imageExists) {
        return await loadImage(imagePath);
    } else {
        return await loadImage(fallbackImagePath);
    }
}

function drawName(name, nameStartingY, textShadow, context) {
    let x = namesStartingX;

    for (const character of name) {
        if (emojiRegex().test(character)) {
            font = 'AppleColorEmoji';
        } else if (/^[a-zA-Z0-9]+$/.test(character)) {
            font = 'LilitaOne-Regular';
        } else if (/[.,\/#!$%\^&\*;:{}=\-_`~()]/g.test(character)) {
            font = 'NotoSans-Bold';
        } else if (character === ' ') {
            x += context.measureText(character).width;
            font = 'Arial'
        }

        if (textShadow) {
            context.font = `${fontSize}px ${font}`;
            context.fillStyle = 'rgba(0, 0, 0, 0.25)';
            context.fillText(character, x, nameStartingY + 5);
        }

        context.font = `${fontSize}px ${font}`;
        context.fillStyle = 'rgba(255, 255, 255)';
        context.fillText(character, x, nameStartingY);

        x += context.measureText(character).width;
    }
}