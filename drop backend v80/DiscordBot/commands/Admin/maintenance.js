const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const matchmaker = require("../../../matchmaker/matchmaker.js");
const functions = require("../../../structs/functions.js");

module.exports = {
    commandInfo: {
        name: "maintenance",
        description: "Toggle backend maintenance mode and optionally kick all currently logged-in users.",
        options: [
            {
                name: "state",
                description: "maintenance state (on or off)",
                required: false,
                type: 3,
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const rawState = String(interaction.options.getString("state") || "on").trim().toLowerCase();
        const enableMaintenance = rawState === "on" || rawState === "enable" || rawState === "true" || rawState === "1";

        global.maintenanceMode = enableMaintenance;
        config.bMaintenance = enableMaintenance;

        try {
            fs.writeFileSync("./Config/config.json", JSON.stringify(config, null, 2));
        } catch (err) {
            console.error("Failed to persist maintenance flag:", err?.message || err);
        }

        if (enableMaintenance) {
            const activeAccountIds = new Set();

            if (Array.isArray(global.accessTokens)) {
                for (const token of global.accessTokens) {
                    if (token?.accountId) activeAccountIds.add(token.accountId);
                }
            }

            if (Array.isArray(global.refreshTokens)) {
                for (const token of global.refreshTokens) {
                    if (token?.accountId) activeAccountIds.add(token.accountId);
                }
            }

            for (const accountId of Array.from(activeAccountIds)) {
                if (typeof matchmaker.kickPlayer === "function") {
                    matchmaker.kickPlayer(accountId);
                }

                if (typeof global.kickUserFromGame === "function") {
                    global.kickUserFromGame(accountId, "Server maintenance mode enabled");
                }
            }

            if (Array.isArray(global.accessTokens)) {
                global.accessTokens = global.accessTokens.filter(token => !activeAccountIds.has(token.accountId));
            }

            if (Array.isArray(global.refreshTokens)) {
                global.refreshTokens = global.refreshTokens.filter(token => !activeAccountIds.has(token.accountId));
            }

            if (Array.isArray(global.Clients)) {
                for (const client of global.Clients) {
                    if (!client || !client.accountId || !activeAccountIds.has(client.accountId)) continue;
                    if (client.client && typeof client.client.close === "function") {
                        client.client.close();
                    }
                }
            }

            if (typeof functions.UpdateTokens === "function") {
                functions.UpdateTokens();
            }
        }

        return interaction.editReply({
            content: enableMaintenance
                ? "Maintenance mode enabled. Logged-in sessions were kicked and future logins are now rejected."
                : "Maintenance mode disabled. Login rejection has been lifted.",
            ephemeral: true
        });
    }
};
