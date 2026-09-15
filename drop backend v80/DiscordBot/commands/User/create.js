const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");

module.exports = {
    commandInfo: {
        name: "create",
        description: "Create an account",
        options: [
            {
                name: "email",
                description: "Your email.",
                required: true,
                type: 3
            },
            {
                name: "password",
                description: "Your password.",
                required: true,
                type: 3
            }
        ],
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const { options } = interaction;

        const discordId = interaction.user.id;
        const email = options.get("email").value;
        const password = options.get("password").value;
        const username = interaction.user.username;
        const normalizedEmail = email.toLowerCase();

        const existingEmail = await User.findOne({ email: normalizedEmail });
        const existingUser = await User.findOne({ username: username });

        const emailFilter = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
        if (!emailFilter.test(email)) {
            return interaction.editReply({ content: "Please enter a valid email address!", ephemeral: true });
        }
        if (existingEmail) {
            return interaction.editReply({ content: "That email address is already in use. Please choose a different email address.", ephemeral: true });
        }
        if (existingUser) {
            return interaction.editReply({ content: "That username is already in use. Please choose a different username.", ephemeral: true });
        }
        if (password.length >= 128) {
            return interaction.editReply({ content: "The password must be less than 128 characters.", ephemeral: true });
        }
        if (password.length < 4) {
            return interaction.editReply({ content: "The password must be at least 4 characters long.", ephemeral: true });
        }

        const resp = await functions.registerUser(discordId, username, normalizedEmail, password);
        if (resp.status !== 200) {
            return interaction.editReply({ content: resp.message, ephemeral: true });
        }

        const embed = new MessageEmbed()
            .setColor("#A020F0")
            .setDescription(`Welcome, **${username}**, to Drop!`)
            .setImage("https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png"); // image

        interaction.editReply({ embeds: [embed], ephemeral: true });
    }
}