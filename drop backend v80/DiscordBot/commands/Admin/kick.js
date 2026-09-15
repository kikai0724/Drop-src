const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "kick",
        description: "kick a user out of their current session by their user.",
        options: [
             {
                name: "user",
                description: "the user u want to kick",
                required: true,
                type: 6
            },
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        
        if (!config.moderators.includes(interaction.user.id)) 
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
    
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const targetUser = await User.findOne({ discordId: selectedUserId });

        if (!targetUser) 
            return interaction.editReply({ content: "that user does not own an account", ephemeral: true });

        let refreshToken = global.refreshTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (refreshToken != -1) global.refreshTokens.splice(refreshToken, 1);

        let accessToken = global.accessTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);

            let xmppClient = global.Clients.find(client => client.accountId == targetUser.accountId);
            if (xmppClient) xmppClient.client.close();
        }

        if (accessToken != -1 || refreshToken != -1) {
            functions.UpdateTokens();
            functions.UpdateTokens();
            functions.UpdateTokens();
            
            return interaction.editReply({ content: `successfully kicked ${targetUser.username}`, ephemeral: true });
        }
        
        interaction.editReply({ content: `there are no current active sessions by ${targetUser.username}`, ephemeral: true });
    }
}