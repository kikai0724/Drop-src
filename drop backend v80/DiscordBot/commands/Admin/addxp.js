const Users = require('../../../model/user');
const config = require('../../../Config/config.json');
const { updateLvlAndXp } = require('../../../structs/functions');

module.exports = {
    commandInfo: {
        name: "addxp",
        description: "Add XP to a user",
        options: [
            {
                name: "user",
                description: "The user to add XP to",
                required: true,
                type: 6
            },
            {
                name: "amount",
                description: "The amount of XP to add (can be negative)",
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
        const xpAmount = interaction.options.getInteger('amount');

        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
        }

        const currentXp = user.xp || 0;
        const currentLevel = user.level || 1;
        const xpUpdate = updateLvlAndXp(currentLevel, currentXp, xpAmount);
        const newXp = Math.max(0, xpUpdate.xp);
        const newLevel = xpUpdate.level;

        await Users.updateOne(
            { discordId: selectedUserId },
            { xp: newXp, level: newLevel }
        );

        const embed = {
            color: 0x112b58,
            title: "XP Updated",
            fields: [
                { name: "User", value: selectedUser.username, inline: true },
                { name: "XP Change", value: `${xpAmount >= 0 ? '+' : ''}${xpAmount}`, inline: true },
                { name: "Previous XP", value: currentXp.toString(), inline: true },
                { name: "New XP", value: newXp.toString(), inline: true },
                { name: "New Level", value: newLevel.toString(), inline: true }
            ]
        };

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
