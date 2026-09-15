const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Arena = require("../../../model/arena.js");
const config = require("../../../Config/config.json");


global.hypeLeaderboardMessage = global.hypeLeaderboardMessage || null;


async function buildLeaderboardEmbed() {
    // Get top 20 players by hype
    const arenaStats = await Arena.find({}).sort({ hype: -1 }).limit(20).lean();
    
    // Get user information for each arena player
    const leaderboardData = [];
    for (const arenaPlayer of arenaStats) {
        const user = await User.findOne({ accountId: arenaPlayer.accountId }).lean();
        if (user) {
            leaderboardData.push({
                username: user.username,
                hype: arenaPlayer.hype
            });
        }
    }


    const now = new Date();
    const embed = new MessageEmbed()
        .setTitle("Hype Leaderboard")
        .setColor("PURPLE")
        .setTimestamp(now)
        .setFooter({
            text: "Shard",
            iconURL: "https://static.wikia.nocookie.net/fortnite/images/d/d3/Beta_Rift_-_Icon_-_Fortnite.png/revision/latest?cb=20211124210020"
        });


    let description = "";
    for (let i = 0; i < 20; i++) {
        const position = i + 1;
        if (i < leaderboardData.length) {
            const player = leaderboardData[i];
            description += `${position}. **${player.username}** - ${player.hype.toLocaleString()} hype\n`;
        } else {
            description += `${position}. **---** - 0 hype\n`;
        }
    }

    embed.setDescription(description);
    embed.addField("Last Updated", `<t:${Math.floor(now.getTime() / 1000)}:R>`, false);

    return embed;
}

module.exports = {
    commandInfo: {
        name: "hypeleaderboard",
        description: "Posts the top 20 players by hype points in this channel (auto-refreshes every 1 minute)"
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        }

        try {
            const embed = await buildLeaderboardEmbed();


            const message = await interaction.channel.send({ embeds: [embed] });
            
            // Confirm to the user
            await interaction.editReply({ 
                content: "Hype leaderboard posted successfully! It will auto-refresh every 1 minute.", 
                ephemeral: true 
            });
            

            if (message && message.id) {
                global.hypeLeaderboardMessage = {
                    messageId: message.id,
                    channelId: interaction.channel.id,
                    guildId: interaction.guild?.id
                };
            }

        } catch (error) {
            console.error("HypeLeaderboard command error:", error);
            await interaction.editReply({ 
                content: "An error occurred while fetching the hype leaderboard. Please try again later.", 
                ephemeral: true 
            });
        }
    },
    buildLeaderboardEmbed 
};

