const { MessageEmbed } = require("discord.js");
const path = require("path");
const fs = require("fs");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const log = require("../../../structs/log.js");
const destr = require("destr");
const config = require('../../../Config/config.json')

module.exports = {
    commandInfo: {
        name: "addall",
        description: "Allows you to give a user all cosmetics without resetting their lockers",
        options: [
            {
                name: "user",
                description: "The user you want to give the cosmetic to",
                required: true,
                type: 6
            }

        ]
    },
    execute: async (interaction) => {

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.reply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        try {
            const targetUser = await Users.findOne({ discordId: selectedUserId });
            if (!targetUser) {
                return interaction.editReply({ content: "That user does not own an account" });
            }

            const profile = await Profiles.findOne({ accountId: targetUser.accountId });
            if (!profile) {
                return interaction.editReply({ content: "That user does not have a profile" });
            }

            const allItemsProfile = destr(fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"), 'utf8'));
            if (!allItemsProfile || !allItemsProfile.items) {
                return interaction.editReply({ content: "Failed to parse allathena.json" });
            }

            if (!profile.profiles || !profile.profiles.athena) {
                return interaction.editReply({ content: "Athena profile not found" });
            }

            const currentItems = profile.profiles.athena.items || {};
            const mergedItems = { ...currentItems };

            for (const [itemId, item] of Object.entries(allItemsProfile.items)) {
                const templateId = String(item.templateId || "").toLowerCase();
                if (templateId.startsWith("cosmeticlocker:")) continue;

                mergedItems[itemId] = JSON.parse(JSON.stringify(item));
            }

            profile.profiles.athena.items = mergedItems;
            profile.profiles.athena.rvn = (profile.profiles.athena.rvn || 0) + 1;
            profile.profiles.athena.commandRevision = (profile.profiles.athena.commandRevision || 0) + 1;
            profile.profiles.athena.updated = new Date().toISOString();

            const updateResult = await Profiles.updateOne(
                { accountId: targetUser.accountId },
                { $set: { "profiles.athena": profile.profiles.athena } }
            );

            if (updateResult.matchedCount !== 1) {
                return interaction.editReply({ content: "There was an error updating the profile." });
            }

            const embed = new MessageEmbed()
                .setTitle("Full Locker Added")
                .setDescription("Successfully added all cosmetics without resetting the selected account's lockers")
                .setColor("GREEN")
                .setFooter({
                    text: "Drop",
                    iconURL: "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png"
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            log.error("An error occurred:", error);
            interaction.editReply({ content: "An error occurred while processing the request." });
        }
    }
};