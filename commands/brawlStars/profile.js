const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Canvas, loadImage } = require('@napi-rs/canvas');
const emojiRegex = require('emoji-regex');
const { join } = require('path');
const { access } = require('fs');

const { playerStats, getBattleLogs } = require('../../utils/factory/brawlStarsClient.js');
const { allBrawlers } = require('../../utils/factory/getAllBrawlers');
const { errorLogger } = require('../../utils/factory/webhookClient');
const { version } = require('../../package.json');
const bsTags = require('../../databaseModels/saveTags');
const { seasonalTheme } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Check your or another player\'s stats.')
        .setDMPermission(false)
        .addUserOption(option => option
            .setName('user')
            .setDescription('Mention a user')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('user') || interaction.user;
        const { id: userId } = user;

        let userTag = interaction.options.getString('tag')?.replace(/#/g, '').replace(/O/gi, '0').toUpperCase();
        const isSelf = userId === interaction.user.id;
        let profile;

        try {
            if (!userTag) {
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
                userTag = profile.playerTag;
            }

            const [player, battleLogs] = await Promise.all([
                playerStats(userTag),
                getBattleLogs(userTag)
            ]);

            if (player) {
                const {
                    name: playerName,
                    tag: playerTag,
                    club: { name: clubName = 'No Club', tag: clubTag },
                    trophies,
                    highestTrophies,
                    expLevel,
                    "3vs3Victories": trioVictories,
                    soloVictories,
                    duoVictories,
                    icon: { id: iconId },
                    brawlers
                } = player;

                const brawlerCount = `${brawlers.length}/ ${allBrawlers.length}`;
                const { trophiesAfterReset, totalBlingAmount } = await calculateSeasonReset(brawlers);
                const { winPercentage } = calculateWinPercentage(battleLogs);
                const favBrawlerId = Number(profile?.favouriteBrawler) || brawlers[0].id;
                const favBrawlerName = allBrawlers.find(brawler => brawler.brawlerId === favBrawlerId).brawlerName;
                const powerLeagueRank = Number(profile?.powerLeagueRank);
                const theme = profile.favouriteTheme || seasonalTheme;

                const canvasWidth = 1920;
                const canvasHeight = 1080;
                const canvas = new Canvas(canvasWidth, canvasHeight);
                const context = canvas.getContext('2d');

                let rankId = 1;

                if (highestTrophies < 1000) rankId = 1;
                else if (highestTrophies < 2000) rankId = 2;
                else if (highestTrophies < 3000) rankId = 3;
                else if (highestTrophies < 4000) rankId = 4;
                else if (highestTrophies < 6000) rankId = 5;
                else if (highestTrophies < 8000) rankId = 6;
                else if (highestTrophies < 10000) rankId = 7;
                else if (highestTrophies < 16000) rankId = 8;
                else if (highestTrophies < 30000) rankId = 9;
                else if (highestTrophies < 50000) rankId = 10;
                else if (highestTrophies >= 50000) rankId = 11;

                const background = await loadImage(join(__dirname, `../../assets/themes/${theme}/bg.png`));
                const backgroundPanel = await loadImage(join(__dirname, `../../assets/themes/${theme}/panels.png`));
                const brawlerBackBorder = await loadImage(join(__dirname, `../../assets/otherAssets/0.png`));
                const statsPanelBorder = await loadImage(join(__dirname, `../../assets/otherAssets/2.png`));
                const statsPanel = await loadImage(join(__dirname, `../../assets/otherAssets/1.png`));
                const brawlerPortrait = await loadAndFallbackImage('../../assets/brawlerPortraits', `${favBrawlerId}.png`, '0.png');
                const playerIcon = await loadAndFallbackImage('../../assets/playerIcons', `${iconId}.png`, '0.png');
                const rankIcon = await loadAndFallbackImage('../../assets/rankIcons', `${rankId}.png`, '0.png');
                const powerLeagueIcon = await loadAndFallbackImage('../../assets/powerLeagueIcons', `${powerLeagueRank}.png`, '0.png');

                context.drawImage(background, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(backgroundPanel, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(brawlerBackBorder, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(statsPanelBorder, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(statsPanel, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(brawlerPortrait, 0, 0, canvasWidth, canvasHeight);
                context.drawImage(rankIcon, (552 - 60 - rankIcon.width * 1.2) / 2 + 60, 960 - (rankIcon.height * 1.2) / 2, rankIcon.width * 1.2, rankIcon.height * 1.2);
                context.drawImage(playerIcon, 575, 62, 223, 223);
                context.drawImage(powerLeagueIcon, 1569 - powerLeagueIcon.width / 2, 610 - powerLeagueIcon.height / 2, powerLeagueIcon.width, powerLeagueIcon.height);


                let x = 825;
                const y = 145;
                const fontSize = 70;

                for (const character of playerName) {
                    let font = 'NotoSans-JP-Bold';

                    if (emojiRegex().test(character)) {
                        font = 'AppleColorEmoji';
                    } else if (/^[a-zA-Z0-9]+$/.test(character)) {
                        font = 'LilitaOne-Regular';
                    }

                    context.font = `80px ${font}`;
                    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
                    context.fillText(character, x, y + 7.5);

                    context.font = `80px ${font}`;
                    context.fillStyle = '#fff';
                    context.fillText(character, x, y);

                    x += context.measureText(character).width;
                }

                const clubNameY = 265;

                x = 825;
                for (const character of clubName) {
                    let font = 'NotoSans-JP-Bold';

                    if (emojiRegex().test(character)) {
                        font = 'AppleColorEmoji';
                    } else if (/^[a-zA-Z0-9]+$/.test(character)) {
                        font = 'LilitaOne-Regular';
                    }

                    context.font = `$80px ${font}`;
                    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
                    context.fillText(character, x, clubNameY + 7.5);

                    context.font = `$80px ${font}`;
                    context.fillStyle = '#fff';
                    context.fillText(character, x, clubNameY);

                    x += context.measureText(character).width;
                }

                const textArray = [
                    highestTrophies.toString(),
                    trioVictories.toString(),
                    soloVictories.toString(),
                    duoVictories.toString(),
                ]
                const boxPositions = [
                    { x1: 688, y1: 325, x2: 1279, y2: 456 },
                    { x1: 688, y1: 475, x2: 1279, y2: 606 },
                    { x1: 688, y1: 625, x2: 1279, y2: 756 },
                    { x1: 688, y1: 775, x2: 1279, y2: 906 },
                ];

                context.font = `${fontSize}px LilitaOne-Regular`;
                context.textAlign = 'center';

                for (let i = 0; i < textArray.length; i++) {
                    const text = textArray[i];
                    const box = boxPositions[i];
                    const textX = ((box.x1 + box.x2) / 2) + 7.5;
                    const textY = ((box.y1 + box.y2) / 2 + fontSize / 4) + 7.5;

                    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
                    context.fillText(text, textX, textY + 7.5);

                    context.fillStyle = '#fff';
                    context.fillText(text, textX, textY);
                }

                const waterMark = `Vreezy v${version}`;
                context.font = '65px LilitaOne-Regular';
                context.fillStyle = 'rgb(0, 0, 0, 0.25)';
                context.fillText(waterMark, canvasWidth - context.measureText(waterMark).width + 125, canvasHeight - 50);

                const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'stats.png' });

                const embed = new EmbedBuilder()
                    .setColor(0xCB35F9)
                    .setAuthor({ name: `${playerName} | ${playerTag}`, iconURL: `https://cdn.brawlify.com/profile/${iconId}.png` })
                    .addFields(
                        { name: 'Trophies', value: `<:icon_trophy:1147194368667701278> ${trophies.toString()}`, inline: true },
                        { name: 'Highest Trophies', value: `<:highestTrophies:1147194397524496435> ${highestTrophies.toString()}`, inline: true },
                        { name: 'Season Reset', value: `<:icon_trophy:1147194368667701278> ${trophiesAfterReset.toString()}`, inline: true },
                        { name: '3 vs 3 Victories', value: `<:3vs3:1147194498976321546> ${trioVictories.toString()}`, inline: true },
                        { name: 'Solo Victories', value: `<:showdown:1147194531360542720> ${soloVictories.toString()}`, inline: true },
                        { name: 'Duo Victories', value: `<:duo:1147194549832273971> ${duoVictories.toString()}`, inline: true },
                        { name: 'Favourite Brawler', value: `<:favbrawler:1148319064796696596> ${favBrawlerName}`, inline: true },
                        { name: 'Exp Level', value: `<:exp:1147194468659900546> ${expLevel.toString()}`, inline: true },
                        { name: 'Win Rate', value: `<:wr:1147194438158913657> ${winPercentage.toString()}%`, inline: true },
                        { name: 'Season Rewards', value: `<:icon_bling:1147194415719383130> ${totalBlingAmount.toString()}`, inline: true },
                        { name: 'Brawlers Unlocked', value: `<:icon_brawlers:1147194570178822314> ${brawlerCount}`, inline: true },
                        { name: 'Club', value: `<:club:1147194637879091390> ${clubName} ${clubTag ? `\`(${clubTag})\`` : ''}`, inline: true }
                    )
                    .setImage('attachment://stats.png');

                await interaction.editReply({
                    embeds: [embed],
                    files: [attachment]
                });

                if (!profile.favouriteBrawler && isSelf) {
                    await interaction.followUp({
                        content: 'It seems like you haven\'t set your favourite brawler yet. Use </set favourite brawler:1147171639482658919> command to set your favourite brawler. If you don\'t, your highest trophy brawler will be used instead',
                        ephemeral: true
                    });
                }
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

function calculateWinPercentage(battles) {
    const battleLog = [];
    for (const battle of battles) {
        const battleMode = battle.battle?.type || "unranked";

        if (battleMode === "ranked") {
            battleLog.push(battle);
        }
    }

    let losesRecorded = 0;
    let winsRecorded = 0;

    if (battleLog.length >= 10) {
        for (const battle of battleLog) {
            const result = battle.battle.result;
            if (result === 'victory') {
                winsRecorded++;
            } else if (result === 'defeat') {
                losesRecorded++;
            }
        }
    }

    const totalBattles = winsRecorded + losesRecorded;

    const winPercentage = totalBattles !== 0 ? ((winsRecorded / totalBattles) * 100).toFixed(2) : 0;

    return {
        winsRecorded,
        losesRecorded,
        winPercentage,
    };
}

async function calculateSeasonReset(brawlers) {
    brawlers.sort((a, b) => b.trophies - a.trophies);

    const brawlersAfterReset = [];
    const top10Brawlers = new Map();
    const brawlersAbove500 = new Map();

    for (const brawler of brawlers) {
        if (brawler.trophies > 500) {
            brawlersAbove500.set(brawler.id, brawler);
            if (top10Brawlers.size < 10) {
                top10Brawlers.set(brawler.id, brawler);
            }
        }
    }

    let totalBlingAmount = 0;
    for (const top10Brawler of top10Brawlers.values()) {
        const brawlerTrophies = top10Brawler.trophies;
        const trophiesAfterReset = calculateBrawlerTrophiesAfterReset(brawlerTrophies);
        const blingAmount = calculateBlingRewards(brawlerTrophies);
        totalBlingAmount += blingAmount;

        const brawlerAfterReset = {
            id: top10Brawler.id,
            trophies: trophiesAfterReset,
        };
        brawlersAfterReset.push(brawlerAfterReset);
    }

    for (const brawlerAbove500 of brawlersAbove500.values()) {
        if (!top10Brawlers.has(brawlerAbove500.id)) {
            const brawlerAfterReset = {
                id: brawlerAbove500.id,
                trophies: brawlerAbove500.trophies,
            };
            brawlersAfterReset.push(brawlerAfterReset);
        }
    }

    for (const brawler of brawlers) {
        if (!top10Brawlers.has(brawler.id) && !brawlersAbove500.has(brawler.id)) {
            const brawlerAfterReset = {
                id: brawler.id,
                trophies: brawler.trophies,
            };
            brawlersAfterReset.push(brawlerAfterReset);
        }
    }

    let trophiesAfterReset = 0;
    for (const brawlerAfterReset of brawlersAfterReset) {
        const brawlerTrophies = brawlerAfterReset.trophies;
        trophiesAfterReset += brawlerTrophies;
    }

    return {
        trophiesAfterReset,
        totalBlingAmount
    }
}

function calculateBrawlerTrophiesAfterReset(brawlerTrophies) {
    const trophyRanges = [
        { start: 500, trophiesAfterReset: 500 },
        { start: 525, trophiesAfterReset: 524 },
        { start: 550, trophiesAfterReset: 549 },
        { start: 575, trophiesAfterReset: 574 },
        { start: 600, trophiesAfterReset: 599 },
        { start: 625, trophiesAfterReset: 624 },
        { start: 650, trophiesAfterReset: 649 },
        { start: 675, trophiesAfterReset: 674 },
        { start: 700, trophiesAfterReset: 699 },
        { start: 725, trophiesAfterReset: 724 },
        { start: 750, trophiesAfterReset: 749 },
        { start: 775, trophiesAfterReset: 774 },
        { start: 800, trophiesAfterReset: 799 },
        { start: 825, trophiesAfterReset: 824 },
        { start: 850, trophiesAfterReset: 849 },
        { start: 875, trophiesAfterReset: 874 },
        { start: 900, trophiesAfterReset: 899 },
        { start: 925, trophiesAfterReset: 924 },
        { start: 950, trophiesAfterReset: 949 },
        { start: 975, trophiesAfterReset: 974 },
        { start: 1000, trophiesAfterReset: 999 },
        { start: 1050, trophiesAfterReset: 1049 },
        { start: 1100, trophiesAfterReset: 1099 },
        { start: 1150, trophiesAfterReset: 1149 },
        { start: 1200, trophiesAfterReset: 1199 },
        { start: 1250, trophiesAfterReset: 1249 },
        { start: 1300, trophiesAfterReset: 1299 },
        { start: 1350, trophiesAfterReset: 1349 },
        { start: 1400, trophiesAfterReset: 1399 },
        { start: 1450, trophiesAfterReset: 1449 },
        { start: 1500, trophiesAfterReset: 1499 },
    ];

    let trophiesAfterReset;

    for (const range of trophyRanges) {
        if (brawlerTrophies >= range.start) {
            trophiesAfterReset = range.trophiesAfterReset;
        } else {
            break;
        }
    }

    return trophiesAfterReset;
}

function calculateBlingRewards(brawlerTrophies) {
    const blingAmounts = [
        { start: 500, amount: 4 },
        { start: 525, amount: 6 },
        { start: 550, amount: 8 },
        { start: 575, amount: 10 },
        { start: 600, amount: 12 },
        { start: 625, amount: 14 },
        { start: 650, amount: 16 },
        { start: 675, amount: 18 },
        { start: 700, amount: 20 },
        { start: 725, amount: 22 },
        { start: 750, amount: 24 },
        { start: 775, amount: 26 },
        { start: 800, amount: 28 },
        { start: 825, amount: 30 },
        { start: 850, amount: 32 },
        { start: 875, amount: 34 },
        { start: 900, amount: 36 },
        { start: 925, amount: 38 },
        { start: 950, amount: 40 },
        { start: 975, amount: 42 },
        { start: 1000, amount: 44 },
        { start: 1050, amount: 46 },
        { start: 1100, amount: 48 },
        { start: 1150, amount: 50 },
        { start: 1200, amount: 52 },
        { start: 1250, amount: 54 },
        { start: 1300, amount: 56 },
        { start: 1350, amount: 58 },
        { start: 1400, amount: 60 },
        { start: 1450, amount: 62 },
        { start: 1500, amount: 64 },
    ];

    let blingReward;

    for (const bling of blingAmounts) {
        if (brawlerTrophies >= bling.start) {
            blingReward = bling.amount;
        } else {
            break;
        }
    }

    return blingReward;
}