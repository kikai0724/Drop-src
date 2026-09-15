const Users = require('../../../model/user');
const config = require('../../../Config/config.json');
const { updateLvlAndXp } = require('../../../structs/functions');

module.exports = {
    commandInfo: {
        name: "addlevel",
        description: "Add levels to a user",
        options: [
            {
                name: "user",
                description: "The user to add levels to",
                required: true,
                type: 6
            },
            {
                name: "levels",
                description: "The number of levels to add (can be negative)",
                required: true,
                type: 4
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
        const levelAmount = interaction.options.getInteger('levels');

        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
        }

        const currentLevel = user.level || 1;
        const currentXp = user.xp || 0;
        const targetLevel = Math.max(1, Math.min(99, currentLevel + levelAmount));

        const targetXp = (() => {
            const xpCurve = require('../../../responses/Athena/XP/xp.json');
            const levelData = xpCurve.find(data => data.level === targetLevel);
            return levelData ? levelData.xpTotal : null;
        })();

        if (targetXp === null) {
            return interaction.editReply({ content: "Invalid level calculation.", ephemeral: true });
        }

        const previousXp = currentXp;
        const newXp = targetXp;

        await Users.updateOne(
            { discordId: selectedUserId },
            { xp: newXp, level: targetLevel }
        );

        const embed = {
            color: 0x112b58,
            title: "Level Updated",
            fields: [
                { name: "User", value: selectedUser.username, inline: true },
                { name: "Level Change", value: `${levelAmount >= 0 ? '+' : ''}${levelAmount}`, inline: true },
                { name: "Previous Level", value: currentLevel.toString(), inline: true },
                { name: "New Level", value: targetLevel.toString(), inline: true },
                { name: "Previous XP", value: previousXp.toString(), inline: true },
                { name: "New XP", value: newXp.toString(), inline: true }
            ]
        };

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
