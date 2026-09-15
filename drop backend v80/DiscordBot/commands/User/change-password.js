const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const bcrypt = require("bcrypt");
const functions = require("../../../structs/functions.js");

module.exports = {
    commandInfo: {
        name: "change-password",
        description: "Change the password for your account.",
        options: [
            {
                name: "password",
                description: "Enter the password you want to change to.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) return interaction.editReply({ content: "you do not have a registered account!", ephemeral: true });

        const plainPassword = interaction.options.get("password").value;

        if (plainPassword.length >= 128) {
            return interaction.editReply({ content: "your password must be less than 128 characters long.", ephemeral: true });
        }
        if (plainPassword.length < 4) {
            return interaction.editReply({ content: "your password must be at least 4 characters long.", ephemeral: true });
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        await user.updateOne({ $set: { password: hashedPassword } });

        const refreshTokenIndex = global.refreshTokens.findIndex(i => i.accountId == user.accountId);
        if (refreshTokenIndex != -1) global.refreshTokens.splice(refreshTokenIndex, 1);

        const accessTokenIndex = global.accessTokens.findIndex(i => i.accountId == user.accountId);
        if (accessTokenIndex != -1) {
            global.accessTokens.splice(accessTokenIndex, 1);

            const xmppClient = global.Clients.find(client => client.accountId == user.accountId);
            if (xmppClient) xmppClient.client.close();
        }

        if (accessTokenIndex != -1 || refreshTokenIndex != -1) {
            await functions.UpdateTokens();
        }

        const embed = new MessageEmbed()
            .setTitle("Changed Password")
            .setDescription("The password for your account has been changed.")
            .setColor("GREEN")
            .setFooter({
                text: "Drop",
                iconURL: "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png",
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
