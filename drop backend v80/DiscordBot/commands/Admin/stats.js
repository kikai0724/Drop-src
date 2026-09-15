const config = require("../../../Config/config.json");

module.exports = {
    commandInfo: {
        name: "stats",
        description: "Update Drop server status manually.",
        options: [
            {
                name: "select",
                description: "Choose a service to update",
                required: true,
                type: 3,
                choices: [
                    { name: "Backend", value: "Backend" },
                    { name: "Match Maker", value: "Match Maker" },
                    { name: "ASIA LateGame Solo", value: "ASIA LateGame Solo" },
                    { name: "ASIA FullMap Solo", value: "ASIA FullMap Solo" }
                ]
            },
            {
                name: "color",
                description: "Choose the status color",
                required: true,
                type: 3,
                choices: [
                    { name: "Online 🟢", value: "Online" },
                    { name: "Error 🟡", value: "Error" },
                    { name: "Offline 🔴", value: "Offline" }
                ]
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const service = interaction.options.getString("select");
        const color = interaction.options.getString("color");

        if (!global.setServerStatus) {
            return interaction.editReply({ content: "Server status management is not initialized yet.", ephemeral: true });
        }

        const updated = await global.setServerStatus(service, color);
        if (!updated) {
            return interaction.editReply({ content: "Invalid service or color value.", ephemeral: true });
        }

        await global.ensureServerStatusMessage(interaction.channel);

        await interaction.editReply({ content: `Updated **${service}** to **${color}**.` , ephemeral: true });
    }
};