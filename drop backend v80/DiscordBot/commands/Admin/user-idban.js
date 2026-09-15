const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const matchmaker = require("../../../matchmaker/matchmaker.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "user-idban",
        description: "Ban a user by accountId, username, usernameLower, or Discord ID.",
        options: [
            {
                name: "user-id",
                description: "The target account/user ID.",
                required: true,
                type: 3
            },
            {
                name: "reason",
                description: "Optional ban reason.",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const targetInput = String(interaction.options.getString("user-id") || "").trim();
        const reason = interaction.options.getString("reason") || "No reason provided";

        if (!targetInput) {
            return interaction.editReply({ content: "Please provide a valid user ID or username.", ephemeral: true });
        }

        const user = await User.findOne({
            $or: [
                { accountId: targetInput },
                { username: targetInput },
                { username_lower: targetInput.toLowerCase() },
                { discordId: targetInput }
            ]
        });

        if (!user) {
            return interaction.editReply({ content: `No user found for: **${targetInput}**`, ephemeral: true });
        }

        if (user.banned) {
            return interaction.editReply({ content: `**${user.username}** is already banned.`, ephemeral: true });
        }

        await user.updateOne({ $set: { banned: true } });
        matchmaker.kickPlayer(user.accountId);
        if (typeof global.kickUserFromGame === "function") {
            global.kickUserFromGame(user.accountId);
        }

        const refreshTokenIndex = Array.isArray(global.refreshTokens)
            ? global.refreshTokens.findIndex((item) => item.accountId == user.accountId)
            : -1;
        if (refreshTokenIndex !== -1) global.refreshTokens.splice(refreshTokenIndex, 1);

        const accessTokenIndex = Array.isArray(global.accessTokens)
            ? global.accessTokens.findIndex((item) => item.accountId == user.accountId)
            : -1;
        if (accessTokenIndex !== -1) {
            global.accessTokens.splice(accessTokenIndex, 1);

            const xmppClient = Array.isArray(global.Clients)
                ? global.Clients.find((client) => client.accountId == user.accountId)
                : null;
            if (xmppClient && xmppClient.client && typeof xmppClient.client.close === "function") {
                xmppClient.client.close();
            }
        }

        if (accessTokenIndex !== -1 || refreshTokenIndex !== -1) {
            await functions.UpdateTokens();
        }

        return interaction.editReply({
            content: `Successfully banned **${user.username}** (ID: ${user.accountId}) for: ${reason}`,
            ephemeral: true
        });
    }
};
