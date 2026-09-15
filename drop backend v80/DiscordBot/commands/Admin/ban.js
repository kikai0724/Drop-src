const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const matchmaker = require("../../../matchmaker/matchmaker.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "ban",
        description: "ban a user from their discord username.",
        options: [
             {
                name: "user",
                description: "the user you want to change the Hype of",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        
        if (!config.moderators.includes(interaction.user.id)) return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const targetUser = await User.findOne({ discordId: selectedUserId });

        if (!targetUser) return interaction.editReply({ content: "that user does not own an account", ephemeral: true });
        else if (targetUser.banned) return interaction.editReply({ content: "this user is already banned", ephemeral: true });

        await targetUser.updateOne({ $set: { banned: true } });
        matchmaker.kickPlayer(targetUser.accountId);
        if (typeof global.kickUserFromGame === "function") {
            global.kickUserFromGame(targetUser.accountId);
        }

        let refreshToken = Array.isArray(global.refreshTokens)
            ? global.refreshTokens.findIndex(i => i.accountId == targetUser.accountId)
            : -1;
        if (refreshToken != -1) global.refreshTokens.splice(refreshToken, 1);

        let accessToken = Array.isArray(global.accessTokens)
            ? global.accessTokens.findIndex(i => i.accountId == targetUser.accountId)
            : -1;
        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);

            let xmppClient = Array.isArray(global.Clients)
                ? global.Clients.find(client => client.accountId == targetUser.accountId)
                : null;
            if (xmppClient && xmppClient.client && typeof xmppClient.client.close === "function") xmppClient.client.close();
        }

        if (accessToken != -1 || refreshToken != -1) functions.UpdateTokens();

        interaction.editReply({ content: `successfully banned **${targetUser.username}**`, ephemeral: true });
    }
}