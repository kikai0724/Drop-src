const User = require("../../../model/user.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "unban",
        description: "unban a user from the game by their username.",
        options: [
            {
                name: "user",
                description: "the target.",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        const respond = async (content) => {
            try {
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply({ content, ephemeral: true });
                }
                return await interaction.reply({ content, ephemeral: true });
            } catch (error) {
                if (error?.code === 10062 || error?.code === 40060 || error?.message?.includes("Unknown interaction")) {
                    return null;
                }
                throw error;
            }
        };

        try {
            await interaction.deferReply({ ephemeral: true });
        } catch (error) {
            if (error?.code !== 10062 && error?.code !== 40060 && !error?.message?.includes("Unknown interaction")) {
                throw error;
            }
        }

        if (!config.moderators.includes(interaction.user.id)) {
            return respond("You do not have moderator permissions.");
        }

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const targetUser = await User.findOne({ discordId: selectedUserId });

        if (!targetUser) return respond("that user does not own an account");
        if (!targetUser.banned) return respond("ts user account is already unbanned.");

        await targetUser.updateOne({ $set: { banned: false } });

        return respond(`unbanned ${targetUser.username}`);
    }
}