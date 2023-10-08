const { SlashCommandBuilder, CommandInteraction, EmbedBuilder } = require('discord.js');
const moment = require('moment');

const { playerStats, getBattleLogs } = require('../../utils/factory/brawlStarsClient.js');
const bsTags = require('../../databaseModels/saveTags.js');
const { allowedModes, allowedTypes, powerLeagueRanksFlipped, powerLeagueEmojis } = require('../../config.json');
const { errorLogger } = require('../../utils/factory/webhookClient.js');
const { version } = require('../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Check you V-Rating.')
        .setDMPermission(false)
        .addUserOption(option => option
            .setName('user')
            .setDescription('The user you want to check')
            .setRequired(false)),

    /**
     * 
     * @param { CommandInteraction } interaction
     */
    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('user') || interaction.user;
        const userId = user.id;
        const isSelf = userId === interaction.user.id;

        try {
            const existingProfile = await bsTags.findOne({
                userId: userId
            });

            if (!existingProfile) {
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

            const playerTag = existingProfile.playerTag;

            const [playerData, battleLogs] = await Promise.all([
                await playerStats(playerTag),
                await getBattleLogs(playerTag)
            ]);

            if (battleLogs.length === 0) {
                const description = isSelf
                    ? `Failed to calulate your V-Rating. You don't have any battle logs.`
                    : `Failed to calulate **${user.username}**'s V-Rating. They don't have any battle logs.`;

                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(description)

                return await interaction.editReply({
                    embeds: [embed]
                });
            }

            const counters = { wins: 0, losses: 0, draws: 0, total: 0 };
            const enemyCounters = { totalEnemies: 0, higherEnemies: 0, lowerEnemies: 0, equalEnemies: 0 };
            let powerLeagueRankChanged = false;
            let newPowerLeagueRank = existingProfile.powerLeagueRank;
            let matchScore = 0;

            for (const battleLog of battleLogs) {
                const { battle: { mode, result, teams, type }, battleTime } = battleLog;
                const alreadyRecorded = moment(battleTime).unix() <= existingProfile.lastRecordedBattleTime;

                if (!allowedModes.includes(mode) || !allowedTypes.includes(type) || alreadyRecorded) {
                    continue;
                }

                switch (result) {
                    case 'victory':
                        counters.wins++;
                        break;
                    case 'defeat':
                        counters.losses++;
                        break;
                    case 'draw':
                        counters.draws++;
                        break;
                }
                counters.total++;

                const playerTeam = teams.find(team => team.find(player => player.tag === playerTag));
                const enemyTeam = teams.find(team => team.find(player => player.tag !== playerTag));
                const player = playerTeam.find(player => player.tag === playerTag);

                if (type === 'soloRanked' && !powerLeagueRankChanged) {
                    powerLeagueRankChanged = existingProfile.powerLeagueRank === player.brawler.trophies;
                    newPowerLeagueRank = player.brawler.trophies;
                }

                const playerTrophies = type === 'soloRanked'
                    ? player.brawler.trophies
                    : Math.round(player.brawler.trophies / 100);

                for (const enemy of enemyTeam) {
                    const enemyTrophies = type === 'soloRanked' ? enemy.brawler.trophies : Math.round(enemy.brawler.trophies / 100);
                    const isHigher = playerTrophies > enemyTrophies;
                    const isLower = playerTrophies < enemyTrophies;

                    if (result === 'victory') {
                        if (isHigher) {
                            matchScore += enemyTrophies;
                            enemyCounters.lowerEnemies++;
                        } else if (isLower) {
                            matchScore += enemyTrophies;
                            enemyCounters.higherEnemies++;
                        } else {
                            matchScore += Math.round(playerTrophies / 2);
                            enemyCounters.equalEnemies++;
                        }
                    } else {
                        if (isHigher) {
                            matchScore -= powerLeagueRanksFlipped[enemyTrophies - 1] || powerLeagueRanksFlipped[enemyTrophies];
                            enemyCounters.higherEnemies++;
                        } else if (isLower) {
                            matchScore -= powerLeagueRanksFlipped[enemyTrophies - playerTrophies - 1] || powerLeagueRanksFlipped[enemyTrophies - playerTrophies] || powerLeagueRanksFlipped[enemyTrophies];
                            enemyCounters.lowerEnemies++;
                        } else {
                            matchScore += Math.round(playerTrophies / 2);
                            enemyCounters.equalEnemies++;
                        }
                    }
                    enemyCounters.totalEnemies++;
                }
            }

            const winrate = (counters.wins / counters.total) * 100 || 0;
            const oldScore = existingProfile.score;
            const finalScore = oldScore + ((newPowerLeagueRank - existingProfile.powerLeagueRank) * 100) + matchScore;
            const lastRecordedBattleTime = moment(battleLogs[0].battleTime).unix();

            if (isSelf) {
                existingProfile.score = finalScore;
                existingProfile.powerLeagueRank = newPowerLeagueRank;
                existingProfile.lastRecordedBattleTime = lastRecordedBattleTime;
                await existingProfile.save();
            }

            const { name: playerName } = playerData;

            const embed = new EmbedBuilder()
                .setColor(0xCB35F9)
                .setTitle('Rating')
                .setDescription(`Name: **${playerName}**\nTag: **${playerTag}**\nHighest Power League Rank: ${powerLeagueEmojis[newPowerLeagueRank]}\n\n__Recent Data__\n> Wins: **${counters.wins}**\n> Losses: **${counters.losses}**\n> Draws: **${counters.draws}**\n> Higher Enemies Faced: **${enemyCounters.higherEnemies}**\n> Lower Enemies Faced: **${enemyCounters.lowerEnemies}**\n> Winrate: **${winrate.toFixed(0)}** %\n\nGain: **${finalScore - oldScore}**\n**## [V-Rating:](https://vreezy.gitbook.io/vreezy/) ${finalScore}**`)
                .setFooter({ text: `Planos | Vreezy v${version}`, iconURL: 'https://cdn.discordapp.com/avatars/1047783519130243112/1b2f5de6f9436fb5928ce98fbb73810c.png?size=4096' })

            await interaction.editReply({
                embeds: [embed]
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