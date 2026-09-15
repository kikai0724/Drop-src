const { MessageEmbed } = require("discord.js");
const Users = require("../../../model/user.js");

module.exports = {
    commandInfo: {
        name: "lookup",
        description: "View the details of a user's account.",
        options: [
            {
                name: "user",
                description: "Target username.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {

    await interaction.deferReply({ ephemeral: true });

    const { options } = interaction;

    const user = await Users.findOne({ username_lower: (options.get("user").value).toLowerCase() }).lean();
    if (!user) return interaction.editReply({ content: "The account username you entered does not exist.", ephemeral: true });

    let onlineStatus = global.Clients.some(i => i.accountId == user.accountId);

    let embed = new MessageEmbed()
        .setColor("GREEN")
        .setDescription(`**User Information:**\n- **Discord User:** <@${user.discordId}>\n- **DiscordID:** ${user.discordId}\n- **In-Game Username:** ${user.username}\n- **Banned:** ${user.banned ? "Yes" : "No"}\n- **Online:** ${onlineStatus ? "Yes" : "No"}`)
        .setFooter({
            text: "Drop",
            iconURL: "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png"
        })

    interaction.editReply({ embeds: [embed], ephemeral: true });
    }
}