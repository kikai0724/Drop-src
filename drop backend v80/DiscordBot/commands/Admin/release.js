const { MessageEmbed } = require("discord.js");
const Users = require("../../../model/user.js");
const Profiles = require("../../../model/profiles.js");
const config = require("../../../Config/config.json");
const log = require("../../../structs/log.js");

module.exports = {
    commandInfo: {
        name: "release",
        description: "Drop Release!",
        options: []
    },
    execute: async (interaction) => {
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.reply({ content: "you do not have moderator permissions.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const users = await Users.find({}).lean();

            const deletedAccountIds = [];
            const preservedAccountIds = [];

            for (const user of users) {
                const username = String(user.username_lower || user.username || "").toLowerCase();
                const isHostAccount = user.isServer === true;
                const isAdminAccount = username.startsWith("kikai_.") || username.startsWith("kikai_");

                if (isHostAccount || isAdminAccount) {
                    preservedAccountIds.push(user.accountId);
                    continue;
                }

                deletedAccountIds.push(user.accountId);
            }

            if (deletedAccountIds.length > 0) {
                await Profiles.deleteMany({ accountId: { $in: deletedAccountIds } });
                await Users.deleteMany({ accountId: { $in: deletedAccountIds } });

                global.accessTokens = Array.isArray(global.accessTokens)
                    ? global.accessTokens.filter((entry) => !deletedAccountIds.includes(entry?.accountId))
                    : [];

                global.refreshTokens = Array.isArray(global.refreshTokens)
                    ? global.refreshTokens.filter((entry) => !deletedAccountIds.includes(entry?.accountId))
                    : [];

                if (Array.isArray(global.Clients)) {
                    global.Clients = global.Clients.filter((client) => !deletedAccountIds.includes(client?.accountId));
                }
            }

            const embed = new MessageEmbed()
                .setTitle("Release completed")
                .setDescription(
                    `Removed ${deletedAccountIds.length} non-host / non-admin account(s).\n` +
                    `Preserved ${preservedAccountIds.length} host/admin account(s).\n` +
                    `Remaining accounts will rebuild their default athena profile from athena.json on next login.`
                )
                .setColor("GREEN")
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            log.error("Release command failed:", error);
            await interaction.editReply({ content: "An error occurred while processing the release command." });
        }
    }
};
