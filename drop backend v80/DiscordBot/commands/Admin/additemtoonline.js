const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const fs = require('fs');
const path = require('path');
const destr = require('destr');
const config = require('../../../Config/config.json');
const uuid = require("uuid");
const log = require("../../../structs/log.js");
const { MessageEmbed } = require('discord.js');

module.exports = {
    commandInfo: {
        name: "additemtoonline",
        description: "gives a selected item or vbucks to all currently online users",
        options: [
            {
                name: "cosmeticname",
                description: "the name of the cosmetic you want to give to online users",
                required: false,
                type: 3
            },
            {
                name: "vbucks",
                description: "the amount of vbucks you want to give to online users (can be negative to deduct vbucks)",
                required: false,
                type: 4
            },
            {
                name: "message",
                description: "custom message to include in the gift box (optional)",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        }

        const cosmeticname = interaction.options.getString('cosmeticname');
        const vbucks = interaction.options.getInteger('vbucks');
        const customMessage = interaction.options.getString('message');

        if (!cosmeticname && vbucks === null) {
            return interaction.editReply({ content: "you must provide either a cosmetic name or vbucks amount.", ephemeral: true });
        }

        if (cosmeticname && vbucks !== null) {
            return interaction.editReply({ content: "you can only provide either a cosmetic name OR vbucks amount, not both.", ephemeral: true });
        }

        try {
            const onlineAccountIds = Array.isArray(global.Clients)
                ? [...new Set(global.Clients.map(client => client.accountId).filter(Boolean))]
                : [];

            if (onlineAccountIds.length === 0) {
                return interaction.editReply({ content: "no online users found.", ephemeral: true });
            }

            const targetUsers = await Users.find({ accountId: { $in: onlineAccountIds } }).lean();

            if (!targetUsers || targetUsers.length === 0) {
                return interaction.editReply({ content: "no online users found in the database.", ephemeral: true });
            }

            let successCount = 0;
            let failCount = 0;
            let cosmeticimage = null;
            let cosmetic = null;
            let foundcosmeticname = "";

            if (cosmeticname) {
                const response = await fetch(`https://fortnite-api.com/v2/cosmetics/br/search?name=${cosmeticname}`);
                const json = await response.json();
                const cosmeticFromAPI = json.data;

                if (!cosmeticFromAPI) {
                    return await interaction.editReply({ content: "could not find the cosmetic", ephemeral: true });
                }

                cosmeticimage = cosmeticFromAPI.images.icon;
                const regex = /^[A-Za-z0-9'°. \s]+$/;
                if (!regex.test(cosmeticname)) {
                    return await interaction.editReply({ content: "please check for correct casing. e.g 'Renegade Raider' is correct.", ephemeral: true });
                }

                const file = fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"));
                const jsonFile = destr(file.toString());
                const items = jsonFile.items;
                let found = false;

                for (const key of Object.keys(items)) {
                    const [type, id] = key.split(":");
                    if (id === cosmeticFromAPI.id) {
                        foundcosmeticname = key;
                        found = true;
                        cosmetic = items[key];
                        break;
                    }
                }

                if (!found) {
                    return await interaction.editReply({ content: `could not find the cosmetic ${cosmeticname}`, ephemeral: true });
                }
            }

            if (vbucks !== null) {
                if (isNaN(vbucks) || vbucks === 0) {
                    return interaction.editReply({ content: "Invalid V-Bucks amount specified.", ephemeral: true });
                }
            }

            for (const user of targetUsers) {
                try {
                    const profile = await Profiles.findOne({ accountId: user.accountId });

                    if (!profile) {
                        failCount++;
                        continue;
                    }

                    if (cosmeticname) {
                        const purchaseId = uuid.v4();
                        const lootList = [{
                            "itemType": cosmetic.templateId,
                            "itemGuid": cosmetic.templateId,
                            "quantity": 1
                        }];

                        const common_core = profile.profiles["common_core"];
                        const athena = profile.profiles["athena"];

                        common_core.items[purchaseId] = {
                            "templateId": `GiftBox:GB_MakeGood`,
                            "attributes": {
                                "fromAccountId": `[${interaction.user.username}]`,
                                "lootList": lootList,
                                "params": {
                                    "userMessage": customMessage || `Have a wonderful day. Thank you for playing Rift!`
                                },
                                "giftedOn": new Date().toISOString()
                            },
                            "quantity": 1
                        };

                        athena.items[foundcosmeticname] = cosmetic;

                        common_core.rvn++;
                        common_core.commandRevision++;
                        common_core.updated = new Date().toISOString();
                        athena.rvn++;
                        athena.commandRevision++;
                        athena.updated = new Date().toISOString();

                        await Profiles.updateOne(
                            { accountId: user.accountId },
                            {
                                $set: {
                                    'profiles.common_core': common_core,
                                    'profiles.athena': athena
                                }
                            }
                        );

                        successCount++;
                    } else if (vbucks !== null) {
                        const filter = { accountId: user.accountId };
                        const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': vbucks } };
                        const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': vbucks } };
                        const options = { new: true };

                        const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, options);
                        if (!updatedProfile) {
                            failCount++;
                            continue;
                        }

                        await Profiles.updateOne(filter, updateProfile0);

                        const common_core = updatedProfile.profiles["common_core"];
                        const profile0 = updatedProfile.profiles["profile0"];

                        const newQuantityCommonCore = common_core.items['Currency:MtxPurchased'].quantity;
                        const newQuantityProfile0 = profile0.items['Currency:MtxPurchased'].quantity + vbucks;

                        if (newQuantityCommonCore < 0 || newQuantityCommonCore >= 1000000) {
                            failCount++;
                            continue;
                        }

                        const purchaseId = uuid.v4();
                        const lootList = [{
                            "itemType": "Currency:MtxGiveaway",
                            "itemGuid": "Currency:MtxGiveaway",
                            "quantity": vbucks
                        }];

                        common_core.items[purchaseId] = {
                            "templateId": `GiftBox:GB_MakeGood`,
                            "attributes": {
                                "fromAccountId": `[Administrator]`,
                                "lootList": lootList,
                                "params": {
                                    "userMessage": customMessage || `Have a wonderful day. Thank you for playing Rift!`
                                },
                                "giftedOn": new Date().toISOString()
                            },
                            "quantity": 1
                        };

                        common_core.rvn += 1;
                        common_core.commandRevision += 1;
                        common_core.updated = new Date().toISOString();

                        await Profiles.updateOne(filter, {
                            $set: {
                                'profiles.common_core': common_core,
                                'profiles.profile0.items.Currency:MtxPurchased.quantity': newQuantityProfile0
                            }
                        });

                        successCount++;
                    }
                } catch (err) {
                    log.error(`Error processing online user ${user.accountId}: ${err.message}`);
                    failCount++;
                }
            }

            const embed = new MessageEmbed()
                .setTitle(cosmeticname ? "Cosmetic Gift Sent to Online Users" : "V-Bucks Added to Online Users")
                .setDescription(
                    cosmeticname
                        ? `Successfully gave the cosmetic **${cosmeticname}** to **${successCount}** online account(s)`
                        : `Successfully added **${vbucks}** V-Bucks to **${successCount}** online account(s)`
                )
                .setColor("GREEN")
                .addFields(
                    { name: "Successful", value: successCount.toString(), inline: true },
                    { name: "Failed", value: failCount.toString(), inline: true }
                )
                .setFooter({
                    text: "Shard",
                    iconURL: "https://static.wikia.nocookie.net/fortnite/images/d/d3/Beta_Rift_-_Icon_-_Fortnite.png/revision/latest?cb=20211124210020"
                })
                .setTimestamp();

            if (cosmeticimage) {
                embed.setThumbnail(cosmeticimage);
            } else if (vbucks !== null) {
                embed.setThumbnail("https://i.imgur.com/yLbihQa.png");
            }

            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (err) {
            log.error(err);
            await interaction.editReply({ content: "An unexpected error occurred", ephemeral: true });
        }
    }
};
