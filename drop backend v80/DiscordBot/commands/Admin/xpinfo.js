const Users = require('../../../model/user');
const config = require('../../../Config/config.json');
const xpData = require('../../../responses/Athena/XP/xp.json');

module.exports = {
    commandInfo: {
        name: "xpinfo",
        description: "View a user's XP and level information",
        options: [
            {
                name: "user",
                description: "The user to check XP for",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;

        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
        }

        const currentXp = user.xp || 0;
        const currentLevel = user.level || 1;

        // Find XP progress to next level
        let xpToNextLevel = 0;
        let xpForCurrentLevel = 0;

        for (let i = 0; i < xpData.length; i++) {
            if (xpData[i].level === currentLevel) {
                xpForCurrentLevel = xpData[i].xpTotal;
                if (i < xpData.length - 1) {
                    xpToNextLevel = xpData[i + 1].xpToNextLvl;
                }
                break;
            }
        }

        const xpProgress = currentXp - xpForCurrentLevel;
        const progressPercent = ((xpProgress / xpToNextLevel) * 100).toFixed(2);

        const embed = {
            color: 0x112b58,
            title: "User XP Information",
            thumbnail: {
                url: selectedUser.displayAvatarURL({ dynamic: true, size: 256 })
            },
            fields: [
                { name: "Username", value: selectedUser.username, inline: true },
                { name: "Level", value: currentLevel.toString(), inline: true },
                { name: "Total XP", value: currentXp.toLocaleString(), inline: true },
                { name: "XP to Next Level", value: xpToNextLevel.toLocaleString(), inline: true },
                { name: "Progress to Next", value: `${xpProgress.toLocaleString()} / ${xpToNextLevel.toLocaleString()} (${progressPercent}%)`, inline: true }
            ]
        };

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
