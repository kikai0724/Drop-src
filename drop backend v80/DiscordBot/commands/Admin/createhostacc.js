const Users = require('../../../model/user');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');

module.exports = {
    commandInfo: {
        name: "createhostacc",
        description: "Create a dedicated host account for the drop server.",
        options: [
            {
                name: "username",
                description: "Host account username",
                required: true,
                type: 3
            },
            {
                name: "email",
                description: "Host account email",
                required: false,
                type: 3
            },
            {
                name: "password",
                description: "Host account password",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const username = interaction.options.getString("username") || "ArenaHost";
        const email = interaction.options.getString("email") || `${username.toLowerCase().replace(/\s+/g, "_")}_${functions.MakeID().replace(/-/g, "").slice(0, 8)}@host.local`;
        const password = interaction.options.getString("password") || `Host${functions.MakeID().replace(/-/g, "").slice(0, 12)}`;

        const created = await functions.registerUser(null, username, email, password, true);
        if (created?.status && created.status !== 200) {
            return interaction.editReply({ content: `Host account creation failed: ${created.message || "unknown error"}` });
        }

        return interaction.editReply({
            content: `Host account created.\nUsername: ${username}\nEmail: ${email}\nPassword: ${password}`,
            ephemeral: true
        });
    }
};
