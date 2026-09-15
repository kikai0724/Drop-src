const Users = require('../../../model/user');
const config = require('../../../Config/config.json');

module.exports = {
    commandInfo: {
        name: "setlevel",
        description: "Set a user's level",
        options: [
            {
                name: "user",
                description: "The user to set level for",
                required: true,
                type: 6
            },
            {
                name: "level",
                description: "The level to set (1-99)",
                required: true,
                type: 4,
                minValue: 1,
                maxValue: 99
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const targetLevel = interaction.options.getInteger('level');

        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
        }

        const xpCurve = require('../../../responses/Athena/XP/xp.json');
        const targetLevelData = xpCurve.find(data => data.level === targetLevel);
        if (!targetLevelData) {
            return interaction.editReply({ content: "Invalid level specified.", ephemeral: true });
        }

        const newXp = targetLevelData.xpTotal;
        const previousLevel = user.level || 1;
        const previousXp = user.xp || 0;

        await Users.updateOne(
            { discordId: selectedUserId },
            { xp: newXp, level: targetLevel }
        );

        const embed = {
            color: 0x112b58,
            title: "Level Updated",
            fields: [
                { name: "User", value: selectedUser.username, inline: true },
                { name: "Previous Level", value: previousLevel.toString(), inline: true },
                { name: "New Level", value: targetLevel.toString(), inline: true },
                { name: "Previous XP", value: previousXp.toString(), inline: true },
                { name: "New XP", value: newXp.toString(), inline: true }
            ]
        };

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
