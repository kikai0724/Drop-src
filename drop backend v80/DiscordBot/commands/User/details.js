const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Profiles = require('../../../model/profiles.js');

module.exports = {
    commandInfo: {
        name: "details",
        description: "View the details of your account.",
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const user = await User.findOne({ discordId: interaction.user.id }).lean();
        const vbucksamount = await Profiles.findOne({ accountId: user?.accountId });
        const currency = vbucksamount?.profiles.common_core.items["Currency:MtxPurchased"].quantity;
        if (!user) return interaction.editReply({ content: "You do not have a registered account!", ephemeral: true });

        let onlineStatus = global.Clients.some(i => i.accountId == user.accountId);

        let embed = new MessageEmbed()
        .setColor("GREEN")
        .setDescription("these are your account details")
        .setFields(
            { name: 'username:', value: user.username },
            { name: 'email:', value: `${user.email}` },
            { name: "online:", value: `${onlineStatus ? "yes" : "no"}` },
            { name: "banned:", value: `${user.banned ? "yes" : "no"}` },
            { name: 'vbux:', value: `${currency} vbux` },
            { name: "account id:", value: user.accountId })
        .setTimestamp()
        .setThumbnail(interaction.user.avatarURL())
        .setFooter({
            text: "Drop",
            iconURL: "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png"
        })

        interaction.editReply({ embeds: [embed], ephemeral: true });
    }
}