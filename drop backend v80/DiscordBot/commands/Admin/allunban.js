const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "allunban",
        description: "Unban all currently banned game accounts.",
        options: []
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        try {
            const bannedUsers = await User.find({ banned: true });

            for (const targetUser of bannedUsers) {
                if (!targetUser || !targetUser.accountId) continue;

                await targetUser.updateOne({ $set: { banned: false } });

                const refreshIndex = global.refreshTokens?.findIndex((i) => i.accountId == targetUser.accountId);
                if (refreshIndex != -1) global.refreshTokens.splice(refreshIndex, 1);

                const accessIndex = global.accessTokens?.findIndex((i) => i.accountId == targetUser.accountId);
                if (accessIndex != -1) {
                    global.accessTokens.splice(accessIndex, 1);

                    const xmppClient = global.Clients?.find((client) => client.accountId == targetUser.accountId);
                    if (xmppClient) xmppClient.client.close();
                }
            }

            if (global.accessTokens || global.refreshTokens) {
                await functions.UpdateTokens();
            }

            return interaction.editReply({
                content: `Unbanned all banned users. Total affected: ${bannedUsers.length}`,
                ephemeral: true
            });
        } catch (error) {
            console.error("allunban command failed:", error);
            return interaction.editReply({
                content: "An error occurred while unbanning all users.",
                ephemeral: true
            });
        }
    }
};
