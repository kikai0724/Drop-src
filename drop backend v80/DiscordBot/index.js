const { Client, Intents, MessageEmbed } = require("discord.js");
const net = require("net");
const matchmaker = require("../matchmaker/matchmaker.js");
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_BANS] });
// Expose the discord client globally so other modules (APIs/routes) can access it.
global.discordClient = client;

async function getDiscordUserAvatarUrl(discordId) {
    const defaultAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    if (!discordId) return defaultAvatarUrl;

    if (!client || !client.readyAt || !client.users || typeof client.users.fetch !== "function") {
        return defaultAvatarUrl;
    }

    try {
        const discordUser = await client.users.fetch(discordId);
        if (discordUser && typeof discordUser.displayAvatarURL === "function") {
            return discordUser.displayAvatarURL({ format: "png", size: 256 });
        }
    } catch (err) {
        console.error(`Failed to resolve Discord avatar for ${discordId}:`, err.message);
    }

    return defaultAvatarUrl;
}

global.getDiscordUserAvatarUrl = getDiscordUserAvatarUrl;
const fs = require("fs");
const path = require("path");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const log = require("../structs/log.js");
const functions = require("../structs/functions.js");
const Users = require("../model/user.js");
const Arena = require("../model/arena.js");

const HEALTH_CHECK_INTERVAL_MS = 30000;
const ONLINE_PLAYERS_CHANNEL_ID = "";
const ONLINE_PLAYERS_MARKER = "# Drop Online Players";
const GAME_SERVER_SERVICE_BY_PLAYLIST = {
    playlist_defaultsolo: "ASIA LateGame Solo",
    playlist_defaultduo: "ASIA FullMap Solo"
};

async function checkTcpEndpoint(host, port, timeout = 2000) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let finished = false;

        const cleanup = (result) => {
            if (finished) return;
            finished = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeout);
        socket.once("connect", () => cleanup(true));
        socket.once("timeout", () => cleanup(false));
        socket.once("error", () => cleanup(false));
        socket.once("close", () => {
            if (!finished) cleanup(false);
        });

        socket.connect(port, host);
    });
}

async function refreshAutomaticServerStatuses() {
    if (!global.setServerStatus) return;

    if (global.matchmakerListening === true) {
        await global.setServerStatus("Match Maker", "Online");
    } else {
        await global.setServerStatus("Match Maker", "Offline");
    }

    const gameServers = Array.isArray(config.gameServerIP) ? config.gameServerIP : [];
    function normalizeRegion(region) {
        if (!region) return null;
        const normalized = String(region).trim().toUpperCase();
        if (["US", "USA", "NA", "NAE", "NAW", "NORTHAMERICA", "NORTH AMERICA"].includes(normalized)) return "NAE";
        if (["ASIA", "APAC", "AP", "OCE", "OCEANIA"].includes(normalized)) return "ASIA";
        return normalized;
    }
    function normalizeGameServerConfigEntry(entry) {
        if (typeof entry === "string") {
            const parts = entry.split(":");
            if (parts.length < 3) return null;
            return {
                host: parts[0],
                port: Number(parts[1]),
                playlist: parts[2].toLowerCase(),
                region: normalizeRegion(parts[3]),
                subregion: normalizeRegion(parts[4])
            };
        }
        if (entry && typeof entry === "object") {
            return {
                host: String(entry.host || entry.ip || ""),
                port: Number(entry.port || entry.serverPort || 0),
                playlist: String(entry.playlist || entry.playlistName || "").toLowerCase(),
                region: normalizeRegion(entry.region || entry.regionName || entry.REGION_s || entry.region_s),
                subregion: normalizeRegion(entry.subregion || entry.SUBREGION_s || entry.subregion_s)
            };
        }
        return null;
    }
    const updatedServices = new Set();

    for (const serverEntry of gameServers) {
        const parsedServer = normalizeGameServerConfigEntry(serverEntry);
        if (!parsedServer || !parsedServer.host || !parsedServer.port || !parsedServer.playlist) continue;
        const host = parsedServer.host;
        const port = parsedServer.port;
        const playlist = parsedServer.playlist;
        const serviceName = GAME_SERVER_SERVICE_BY_PLAYLIST[playlist];
        if (!serviceName) continue;

        const isOnline = await checkTcpEndpoint(host, port);
        const currentStatus = global.serverStatus?.services?.[serviceName];
        const currentFailures = global.serverStatus?.failureCounts?.[serviceName] || 0;

        if (isOnline) {
            global.serverStatus.failureCounts[serviceName] = 0;
            await global.setServerStatus(serviceName, "Online");
        } else if (currentStatus === "🟢") {
            global.serverStatus.failureCounts[serviceName] = currentFailures + 1;
            if ((currentFailures + 1) >= 2) {
                await global.setServerStatus(serviceName, "Offline");
            }
        } else {
            await global.setServerStatus(serviceName, "Offline");
        }

        updatedServices.add(serviceName);
    }

    Object.values(GAME_SERVER_SERVICE_BY_PLAYLIST).forEach(serviceName => {
        if (!updatedServices.has(serviceName)) {
            global.setServerStatus(serviceName, "Offline");
        }
    });
}

const serverStatusDefaults = {
    "ASIA FullMap Solo": "🟢",
    "ASIA LateGame Solo": "🟢",
    "Match Maker": "🟢",
    "Backend": "🟢"
};

const statusColorChoices = {
    Online: "🟢",
    Error: "🟡",
    Offline: "🔴"
};

global.serverStatus = global.serverStatus || {
    services: { ...serverStatusDefaults },
    statusMessage: global.serverStatus?.statusMessage || null,
    failureCounts: global.serverStatus?.failureCounts || {}
};

global.buildServerStatusText = function () {
    const lines = [
        "# Drop Server Status 📢",
        "",
    ];

    for (const name of Object.keys(global.serverStatus.services)) {
        lines.push(`• **${name}:** ${global.serverStatus.services[name]}`);
    }

    lines.push("");
    lines.push("🟢 Connected normally | 🟡 Connected but experiencing issues | 🔴 Disconnected");

    return lines.join("\n");
};

global.refreshServerStatusMessage = async function () {
    if (!global.serverStatus.statusMessage?.messageId || !global.serverStatus.statusMessage?.channelId) return;
    try {
        const channel = await client.channels.fetch(global.serverStatus.statusMessage.channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(global.serverStatus.statusMessage.messageId);
        if (!message) return;

        await message.edit({ content: global.buildServerStatusText() });
    } catch (error) {
        console.error("Failed to refresh server status message:", error);
    }
};

global.setServerStatus = async function (service, colorKey) {
    if (!Object.prototype.hasOwnProperty.call(global.serverStatus.services, service)) return false;
    if (!Object.prototype.hasOwnProperty.call(statusColorChoices, colorKey)) return false;

    global.serverStatus.services[service] = statusColorChoices[colorKey];
    await global.refreshServerStatusMessage();
    return true;
};

global.updateOnlinePlayersMessage = async function () {
    if (!client.readyAt) return false;

    try {
        const channel = await client.channels.fetch(ONLINE_PLAYERS_CHANNEL_ID);
        if (!channel || !channel.messages) return false;

        const onlineClients = Array.isArray(global.Clients) ? global.Clients : [];
        const matchmakerPlayers = typeof matchmaker.getOnlineMatchmakerPlayers === "function"
            ? matchmaker.getOnlineMatchmakerPlayers()
            : [];

        const usernamesByKey = new Map();
        onlineClients.forEach((onlineClient) => {
            const key = String(onlineClient.accountId || onlineClient.displayName || onlineClient.jid || onlineClient.token || "unknown");
            const username = String(onlineClient.displayName || onlineClient.accountId || "Unknown");
            if (!usernamesByKey.has(key)) {
                usernamesByKey.set(key, username);
            }
        });

        const usernames = Array.from(usernamesByKey.values()).filter(Boolean);
        const onlinePlayers = usernames.length;
        const matchmakingQueuePlayers = Array.isArray(matchmakerPlayers) ? matchmakerPlayers.length : 0;
        const usernameBlocks = usernames.length > 0
            ? usernames.map(username => `\`\`\`${username}\`\`\``).join("\n")
            : "\`\`\`(none)\`\`\`";
        const content = `${ONLINE_PLAYERS_MARKER}\n**${onlinePlayers}** player${onlinePlayers === 1 ? "" : "s"} online\n**${matchmakingQueuePlayers}** matchmaking player${matchmakingQueuePlayers === 1 ? "" : "s"} queued\n\n${usernameBlocks}`;
        let message = global.onlinePlayersMessage || null;

        if (!message) {
            const messages = await channel.messages.fetch({ limit: 50 });
            message = messages.find((candidate) =>
                candidate.author?.id === client.user.id &&
                typeof candidate.content === "string" &&
                candidate.content.startsWith(`${ONLINE_PLAYERS_MARKER}\n`)
            );
        }

        if (message) {
            await message.edit({ content });
        } else {
            message = await channel.send({ content });
        }

        global.onlinePlayersMessage = message;
        return true;
    } catch (error) {
        console.error("Failed to update online players message:", error.message || error);
        return false;
    }
};

global.ensureServerStatusMessage = async function (channel) {
    try {
        const statusText = global.buildServerStatusText();

        if (global.serverStatus.statusMessage?.messageId && global.serverStatus.statusMessage?.channelId) {
            try {
                const existingChannel = await client.channels.fetch(global.serverStatus.statusMessage.channelId);
                if (existingChannel) {
                    const existingMessage = await existingChannel.messages.fetch(global.serverStatus.statusMessage.messageId);
                    if (existingMessage) {
                        await existingMessage.edit({ content: statusText });
                        return existingMessage;
                    }
                }
            } catch (innerError) {
                // ignore and recreate message below
            }
        }

        const message = await channel.send({ content: statusText });
        if (message?.id) {
            global.serverStatus.statusMessage = {
                channelId: message.channel.id,
                messageId: message.id,
                guildId: message.guild?.id
            };
        }
        return message;
    } catch (error) {
        console.error("Failed to create or update server status message:", error);
        return null;
    }
};

client.once("ready", () => {
    log.bot("Bot is up and running!");

    global.updateOnlinePlayersMessage().catch(error => {
        console.error("Failed to initialize online players message:", error);
    });

    if (config.discord.bEnableInGamePlayerCount) {
        function updateBotStatus() {
            if (global.Clients && Array.isArray(global.Clients)) {
                client.user.setActivity(`${global.Clients.length} players`, { type: "WATCHING" });
            }
        }

        updateBotStatus();
        setInterval(updateBotStatus, 10000);
    }

    refreshAutomaticServerStatuses().catch(error => {
        console.error("Failed to refresh automatic server statuses on startup:", error);
    });
    setInterval(() => {
        refreshAutomaticServerStatuses().catch(error => {
            console.error("Failed to refresh automatic server statuses:", error);
        });
    }, HEALTH_CHECK_INTERVAL_MS);

    let commands = client.application.commands;

    const loadCommands = (dir) => {
        fs.readdirSync(dir).forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.lstatSync(filePath).isDirectory()) {
                loadCommands(filePath);
            } else if (file.endsWith(".js")) {
                const command = require(filePath);
                commands.create(command.commandInfo);
            }
        });
    };

    loadCommands(path.join(__dirname, "commands"));

    // Initialize hype leaderboard auto-refresh
    global.hypeLeaderboardMessage = global.hypeLeaderboardMessage || null;

    // Function to update hype leaderboard
    async function updateHypeLeaderboard() {
        if (!global.hypeLeaderboardMessage || !global.hypeLeaderboardMessage.messageId) {
            log.debug("Hype leaderboard: No message stored, skipping update");
            return;
        }

        try {
            log.debug(`Hype leaderboard: Attempting to update message ${global.hypeLeaderboardMessage.messageId} in channel ${global.hypeLeaderboardMessage.channelId}`);
            
            const channel = await client.channels.fetch(global.hypeLeaderboardMessage.channelId);
            if (!channel) {
                log.error("Hype leaderboard: Channel not found, clearing stored message");
                global.hypeLeaderboardMessage = null;
                return;
            }

            const message = await channel.messages.fetch(global.hypeLeaderboardMessage.messageId);
            if (!message) {
                log.error("Hype leaderboard: Message not found, clearing stored message");
                global.hypeLeaderboardMessage = null;
                return;
            }

            // Use the shared function from the command file
            const hypeLeaderboardCommand = require(path.join(__dirname, "commands/Admin/hypeleaderboard.js"));
            const embed = await hypeLeaderboardCommand.buildLeaderboardEmbed();

            await message.edit({ embeds: [embed] });
            console.log("Arena leaderboard updated");
            log.bot("Hype leaderboard updated successfully");
        } catch (error) {
            log.error(`Error updating hype leaderboard: ${error.message}`);
            if (error.stack) {
                log.error(`Stack trace: ${error.stack}`);
            }
            // Clear the stored message if it no longer exists
            if (error.code === 10008 || error.code === 10003) { // Unknown Message or Unknown Channel
                log.error("Hype leaderboard: Message or channel no longer exists, clearing stored message");
                global.hypeLeaderboardMessage = null;
            }
        }
    }

    // Update hype leaderboard every 1 minute (60000 ms)
    setInterval(updateHypeLeaderboard, 60000);
    log.bot("Hype leaderboard auto-refresh enabled (updates every 1 minute)");
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isApplicationCommand()) return;

    const executeCommand = async (dir, commandName) => {
        const commandPath = path.join(dir, commandName + ".js");
        if (fs.existsSync(commandPath)) {
            try {
                await require(commandPath).execute(interaction);
            } catch (error) {
                console.error(`Failed to execute slash command ${commandName}:`, error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "An unexpected error occurred while processing that command.", ephemeral: true });
                    } else {
                        await interaction.editReply({ content: "An unexpected error occurred while processing that command." });
                    }
                } catch (replyError) {
                    console.error(`Failed to send fallback response for slash command ${commandName}:`, replyError);
                }
            }
            return true;
        }
        const subdirectories = fs.readdirSync(dir).filter(subdir => fs.lstatSync(path.join(dir, subdir)).isDirectory());
        for (const subdir of subdirectories) {
            if (await executeCommand(path.join(dir, subdir), commandName)) {
                return true;
            }
        }
        return false;
    };

    try {
        await executeCommand(path.join(__dirname, "commands"), interaction.commandName);
    } catch (error) {
        console.error("Unexpected error while resolving slash command:", error);
    }
});

client.on("guildBanAdd", async (ban) => {
    if (!config.bEnableCrossBans) 
        return;

    const memberBan = await ban.fetch();

    if (memberBan.user.bot)
        return;

    const userData = await Users.findOne({ discordId: memberBan.user.id });

    if (userData && userData.banned !== true) {
        await userData.updateOne({ $set: { banned: true } });

        let refreshToken = global.refreshTokens.findIndex(i => i.accountId == userData.accountId);

        if (refreshToken != -1)
            global.refreshTokens.splice(refreshToken, 1);
        let accessToken = global.accessTokens.findIndex(i => i.accountId == userData.accountId);

        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);
            let xmppClient = global.Clients.find(client => client.accountId == userData.accountId);
            if (xmppClient)
                xmppClient.client.close();
        }

        if (accessToken != -1 || refreshToken != -1) {
            await functions.UpdateTokens();
        }

        log.debug(`user ${memberBan.user.username} (ID: ${memberBan.user.id}) was banned on the discord and also in the game (Cross Ban active).`);
    }
});

client.on("guildBanRemove", async (ban) => {
    if (!config.bEnableCrossBans) 
        return;

    if (ban.user.bot)
        return;

    const userData = await Users.findOne({ discordId: ban.user.id });
    
    if (userData && userData.banned === true) {
        await userData.updateOne({ $set: { banned: false } });

        log.debug(`User ${ban.user.username} (ID: ${ban.user.id}) is now unbanned.`);
    }
});

//AntiCrash System
client.on("error", async (err) => {
    console.log("Discord API Error:", err);
    if (global.setServerStatus) await global.setServerStatus("Backend", "Error");
});
  
process.on("unhandledRejection", async (reason, p) => {
    console.log("Unhandled promise rejection:", reason, p);
    if (global.setServerStatus) await global.setServerStatus("Backend", "Error");
});
  
process.on("uncaughtException", async (err, origin) => {
    console.log("Uncaught Exception:", err, origin);
    if (global.setServerStatus) await global.setServerStatus("Backend", "Error");
});
  
process.on("uncaughtExceptionMonitor", async (err, origin) => {
    console.log("Uncaught Exception Monitor:", err, origin);
    if (global.setServerStatus) await global.setServerStatus("Backend", "Error");
});

client.login(config.discord.bot_token);

module.exports = { getDiscordUserAvatarUrl };