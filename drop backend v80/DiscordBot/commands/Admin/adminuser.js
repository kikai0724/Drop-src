const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');
const { MessageEmbed } = require('discord.js');

module.exports = {
    commandInfo: {
        name: "adminuser",
        description: "Perform admin user actions like XP, V-Bucks, and item grants",
        options: [
            {
                name: "action",
                description: "The type of admin action to perform",
                required: true,
                type: 3,
                choices: [
                    { name: "xp", value: "xp" },
                    { name: "vbucks", value: "vbucks" },
                    { name: "item", value: "item" }
                ]
            },
            {
                name: "user",
                description: "The linked Discord user to apply the action to",
                required: false,
                type: 6
            },
            {
                name: "accountid",
                description: "The in-game account ID to apply the action to",
                required: false,
                type: 3
            },
            {
                name: "amount",
                description: "Amount of XP or V-Bucks to add or deduct",
                required: false,
                type: 4
            },
            {
                name: "templateid",
                description: "The item templateId to grant to the user",
                required: false,
                type: 3
            },
            {
                name: "quantity",
                description: "Quantity for the item grant",
                required: false,
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
        const accountIdOption = interaction.options.getString('accountid');
        const action = interaction.options.getString('action');
        const amount = interaction.options.getInteger('amount');
        const templateId = interaction.options.getString('templateid');
        const quantity = interaction.options.getInteger('quantity') || 1;

        if (!selectedUser && !accountIdOption) {
            return interaction.editReply({ content: "Please provide either a Discord user or an accountId.", ephemeral: true });
        }

        let user;
        if (selectedUser) {
            user = await Users.findOne({ discordId: selectedUser.id });
        } else {
            user = await Users.findOne({ accountId: accountIdOption });
        }

        if (!user) {
            return interaction.editReply({ content: "Target user not found or not linked.", ephemeral: true });
        }

        if (action === 'xp') {
            if (typeof amount !== 'number') {
                return interaction.editReply({ content: "Please provide a valid amount for XP.", ephemeral: true });
            }

            const currentXp = user.xp || 0;
            const currentLevel = user.level || 1;
            const xpUpdate = functions.updateLvlAndXp(currentLevel, currentXp, amount);
            const newXp = Math.max(0, xpUpdate.xp);
            const newLevel = xpUpdate.level;

            await Users.updateOne({ _id: user._id }, { xp: newXp, level: newLevel, lastXpUpdate: new Date() });

            const embed = new MessageEmbed()
                .setTitle("Admin XP Update")
                .setDescription(`Updated XP for **${user.username}** (${user.accountId})`)
                .addFields(
                    { name: "XP Change", value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
                    { name: "Previous XP", value: `${currentXp}`, inline: true },
                    { name: "New XP", value: `${newXp}`, inline: true },
                    { name: "New Level", value: `${newLevel}`, inline: true }
                )
                .setColor("GREEN")
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        }

        if (action === 'vbucks') {
            if (typeof amount !== 'number' || amount === 0) {
                return interaction.editReply({ content: "Please provide a non-zero V-Bucks amount.", ephemeral: true });
            }

            const profile = await Profiles.findOne({ accountId: user.accountId });
            if (!profile) {
                return interaction.editReply({ content: "Profile not found for the target account.", ephemeral: true });
            }

            const filter = { accountId: user.accountId };
            const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': amount } };
            const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': amount } };
            const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, { new: true });
            if (!updatedProfile) {
                return interaction.editReply({ content: "Failed to update V-Bucks; profile not found or missing Currency:MtxPurchased.", ephemeral: true });
            }

            await Profiles.updateOne(filter, updateProfile0);
            const commonCoreQuantity = updatedProfile.profiles.common_core.items['Currency:MtxPurchased'].quantity;

            const embed = new MessageEmbed()
                .setTitle("Admin V-Bucks Update")
                .setDescription(`Updated V-Bucks for **${user.username}** (${user.accountId})`)
                .addFields(
                    { name: "V-Bucks Change", value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
                    { name: "Current Common Core", value: `${commonCoreQuantity}`, inline: true }
                )
                .setColor("GREEN")
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        }

        if (action === 'item') {
            if (!templateId) {
                return interaction.editReply({ content: "Please provide a templateId for the item grant.", ephemeral: true });
            }

            const profile = await Profiles.findOne({ accountId: user.accountId });
            if (!profile) {
                return interaction.editReply({ content: "Profile not found for the target account.", ephemeral: true });
            }

            profile.profiles.athena = profile.profiles.athena || { items: {} };
            profile.profiles.athena.items = profile.profiles.athena.items || {};
            profile.profiles.athena.items[templateId] = {
                templateId,
                attributes: {
                    item_seen: false
                },
                quantity: quantity
            };

            await profile.save();

            const embed = new MessageEmbed()
                .setTitle("Admin Item Grant")
                .setDescription(`Granted item **${templateId}** to **${user.username}** (${user.accountId})`)
                .addFields(
                    { name: "Quantity", value: `${quantity}`, inline: true }
                )
                .setColor("GREEN")
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        }

        return interaction.editReply({ content: "Unknown action type.", ephemeral: true });
    }
};
