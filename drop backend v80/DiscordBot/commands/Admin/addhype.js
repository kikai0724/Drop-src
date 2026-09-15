const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');
const uuid = require("uuid");
const { MessageEmbed } = require("discord.js");

module.exports = {
    commandInfo: {
        name: "addhype",
        description: "lets you add arena points to a user",
        options: [
            {
                name: "user",
                description: "the user you want to change the Hype of",
                required: true,
                type: 6
            },
            {
                name: "hype",
                description: "the amount of hype points you want to give",
                required: true,
                type: 4
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        }

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });

        if (!user) {
            return interaction.editReply({ content: "that user does not own an account", ephemeral: true });
        }

        const hype = parseInt(interaction.options.getInteger('hype'));
        if (isNaN(hype) || hype === 0) {
            return interaction.editReply({ content: "invalid hype amount specified.", ephemeral: true });
        }

        // adds excat hyupe
        await functions.updateHypePoints(user, hype);
        
        const totalPoints = await functions.calculateTotalHypePoints(user);
        if (isNaN(totalPoints)) 
            return interaction.editReply({ content: "error calculating updated hype points.", ephemeral: true });

        const embed = new MessageEmbed()
            .setTitle("added points")
            .setDescription(`added **${hype}** points to <@${selectedUserId}>, updated points: ${totalPoints}`)
            .setThumbnail("https://i.imgur.com/zBvLCRx.png")
            .setColor("GREEN")
            .setFooter({
                text: "Shard",
                iconURL: "https://static.wikia.nocookie.net/fortnite/images/d/d3/Beta_Rift_-_Icon_-_Fortnite.png/revision/latest?cb=20211124210020"
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};