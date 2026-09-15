const express = require("express");
const app = express.Router();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const User = require("../model/user.js");
const Friends = require("../model/friends.js");
const log = require("../structs/log.js");
const bcrypt = require("bcrypt");
const XMLBuilder = require("xmlbuilder");
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "Config", "config.json"), "utf8"));
const functions = require("../structs/functions.js");

// Each entry may be a plain accountId string or an object like { accountId, created, ... }.
const toAccountId = (entry) => (typeof entry === "string" ? entry : entry?.accountId);

// In-memory store of the launcher's own "I'm just sitting here" heartbeats, keyed by accountId.
// This only fills the gap before/without an actual live game (XMPP) session — real in-game
// presence from global.Clients always takes priority over this when both exist.
const launcherHeartbeats = new Map(); // accountId -> { status: "in_launcher" | "in_game", lastSeen: number }
const LAUNCHER_HEARTBEAT_TTL_MS = 45 * 1000; // a bit more than the launcher's 20s heartbeat interval

// Periodically drop stale entries so this Map doesn't grow forever across long uptimes.
setInterval(() => {
    const now = Date.now();
    for (const [accountId, entry] of launcherHeartbeats) {
        if (now - entry.lastSeen >= LAUNCHER_HEARTBEAT_TTL_MS) launcherHeartbeats.delete(accountId);
    }
}, 60 * 1000);

// Reads live presence (online/offline + current in-game status text) from the connected XMPP clients.
// Falls back to the launcher's own heartbeat (in_launcher / in_game) if there's no live game session yet.
function getPresence(accountId) {
    if (global.Clients) {
        const client = global.Clients.find((c) => c.accountId === accountId);
        if (client) {
            let statusText = null;
            try {
                const parsed = JSON.parse(client.lastPresenceUpdate?.status || "{}");
                statusText = parsed.Status || null;
            } catch (err) {
                statusText = null;
            }

            return {
                online: true,
                away: !!client.lastPresenceUpdate?.away,
                status: statusText
            };
        }
    }

    const heartbeat = launcherHeartbeats.get(accountId);
    if (heartbeat && (Date.now() - heartbeat.lastSeen) < LAUNCHER_HEARTBEAT_TTL_MS) {
        return { online: true, away: false, status: heartbeat.status };
    }

    return { online: false, away: false, status: null };
}

async function getDiscordRoleIdsForUser(user, discordClient) {
    if (!user?.discordId) {
        return { roleIds: [], ready: false, guildCount: 0, error: "Missing discordId" };
    }

    const botToken = discordClient?.token || global.discordBotToken || config.discord?.bot_token || null;
    const roleIds = new Set();
    let guildCount = 0;
    let ready = Boolean(discordClient?.readyAt || discordClient?.ws?.status === 0);
    let error = null;

    try {
        const guilds = Array.isArray(discordClient?.guilds?.cache?.values?.())
            ? Array.from(discordClient.guilds.cache.values())
            : [];

        if (guilds.length) {
            guildCount = guilds.length;
            for (const guild of guilds) {
                try {
                    const member = await guild.members.fetch(user.discordId).catch(() => null);
                    if (!member?.roles?.cache) continue;

                    member.roles.cache.forEach((role) => {
                        if (role?.id) roleIds.add(role.id);
                    });
                } catch (guildErr) {
                    // Ignore guilds where the bot cannot access member data.
                }
            }
        } else if (botToken) {
            const guildsResponse = await axios.get("https://discord.com/api/v10/users/@me/guilds", {
                headers: {
                    Authorization: `Bot ${botToken}`,
                    "User-Agent": "discord-bot"
                },
                timeout: 10000
            });

            const guildsData = Array.isArray(guildsResponse?.data) ? guildsResponse.data : [];
            guildCount = guildsData.length;

            for (const guildMeta of guildsData) {
                try {
                    const memberResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildMeta.id}/members/${user.discordId}`, {
                        headers: {
                            Authorization: `Bot ${botToken}`,
                            "User-Agent": "discord-bot"
                        },
                        timeout: 10000
                    });

                    const memberRoles = Array.isArray(memberResponse?.data?.roles) ? memberResponse.data.roles : [];
                    memberRoles.forEach((roleId) => {
                        if (roleId) roleIds.add(roleId);
                    });
                } catch (guildErr) {
                    // Ignore guilds the bot cannot access or where the user is not a member.
                }
            }

            ready = true;
        }
    } catch (err) {
        error = err.message;
        log.error('Discord Role Fetch Error:', err.message);
    }

    return { roleIds: Array.from(roleIds), ready, guildCount, error };
}

//Api for launcher login (If u want a POST requesto just replace "app.get" to "app.post" and "req.query" to "req.body")
app.get("/api/launcher/login", async (req, res) => {
    log.debug(`Launcher login requested query=${JSON.stringify(req.query)} body=${JSON.stringify(req.body)}`);
    const { email, password } = req.query;

    if (!email || !password) return res.status(400).send('Missing email or password.');

    try {
        let user = await User.findOne({ email: String(email).toLowerCase() });
        if (!user) {
            const discordId = String(req.query.discordId || "").trim();
            if (discordId) {
                user = await User.findOne({ discordId });
            }
        }

        if (!user) {
            const discordId = String(req.query.discordId || "").trim();
            if (discordId) {
                const generatedEmail = `${discordId}@dropfn.com`;
                const generatedPassword = functions.MakeID().replace(/-/g, "").substring(0, 16);
                const created = await functions.registerUser(discordId, `drop_${discordId.slice(-6)}`, generatedEmail, generatedPassword, false);
                if (created.status === 200 || created.status === 201) {
                    user = await User.findOne({ discordId });
                } else {
                    log.warn('Launcher auto-create account failed:', created.message);
                }
            }
        }

        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        await User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

        let avatarHash = null;
        let discordIconUrl = null;
        let avatarUrl = user.avatarUrl || null;

        try {
            if (user.discordId) {
                log.debug(`Launcher login: user=${user.accountId} discordId=${user.discordId} savedAvatar=${Boolean(user.avatarUrl)}`);
                const discordClient = req.client || global.discordClient || global.client;
                if (discordClient && discordClient.users && typeof discordClient.users.fetch === 'function') {
                    const discordUser = await discordClient.users.fetch(user.discordId);
                    avatarHash = discordUser?.avatar;
                    if (discordUser && typeof discordUser.displayAvatarURL === 'function') {
                        if (!avatarUrl) {
                            avatarUrl = discordUser.displayAvatarURL({ format: 'png', size: 256 });
                        }
                    }
                    if (discordUser?.id && avatarHash) {
                        discordIconUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${avatarHash}.png`;
                    }
                    log.debug(`Launcher login: discord fetch complete for ${user.accountId} avatarHash=${avatarHash || 'null'} avatarUrl=${avatarUrl ? 'found' : 'null'} discordIconUrl=${discordIconUrl ? 'found' : 'null'}`);
                } else {
                    log.debug('Discord client not available to fetch avatar for user', user.accountId);
                }
            } else {
                log.debug('Launcher login: no discordId for user', user.accountId);
            }
        } catch (discordErr) {
            log.error('Discord Fetch Error:', discordErr.message);
        }

        log.debug(`Launcher login response for ${user.accountId}: avatarUrl=${avatarUrl ? avatarUrl : 'null'} avatarHash=${avatarHash ? avatarHash : 'null'} discordIconUrl=${discordIconUrl ? discordIconUrl : 'null'}`);

        return res.status(200).json({
            accountId: user.accountId,
            username: user.username,
            email: user.email,
            password: password,
            discordId: user.discordId,
            avatarUrl: avatarUrl,
            avatarHash: avatarHash,
            discordIconUrl: discordIconUrl
        });

    } catch (err) {
        log.error('Launcher Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for the launcher to report its own presence (in_launcher / in_game), so friends can see
//"in launcher" status even before the actual game connects via XMPP. Same auth as /login.
app.post("/api/launcher/presence", async (req, res) => {
    const { email, password, status } = req.body;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (status !== "in_launcher" && status !== "in_game") return res.status(400).send('Invalid status.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const previous = launcherHeartbeats.get(user.accountId);
        launcherHeartbeats.set(user.accountId, { status, lastSeen: Date.now() });

        // Only push to friends' live game sessions when the status actually changed —
        // no point sending an XMPP presence stanza on every 20s heartbeat tick.
        if (!previous || previous.status !== status) {
            await broadcastLauncherPresence(user.accountId, status);
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        log.error('Launcher Presence Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher Discord role list (re-authenticates with email/password, same as login)
app.get("/api/launcher/discordrole", async (req, res) => {
    const { email, password } = req.query;

    if (!email || !password) return res.status(400).send('Missing email or password.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const discordClient = req.client || global.discordClient || global.client;
        const { roleIds, ready, guildCount, error } = await getDiscordRoleIdsForUser(user, discordClient);

        return res.status(200).json({
            accountId: user.accountId,
            discordId: user.discordId || null,
            roleIds,
            ready,
            guildCount,
            error: error || null
        });
    } catch (err) {
        log.error('Launcher Discord Role Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher friends list (re-authenticates with email/password, same as login)
app.get("/api/launcher/friends", async (req, res) => {
    const { email, password } = req.query;

    if (!email || !password) return res.status(400).send('Missing email or password.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const friendsDoc = await Friends.findOne({ accountId: user.accountId }).lean();
        const list = friendsDoc?.list || { accepted: [], incoming: [], outgoing: [], blocked: [] };

        // Each entry may be a plain accountId string or an object like { accountId, created, ... }.
        const hydrate = async (entries) => {
            const ids = (entries || []).map(toAccountId).filter(Boolean);
            if (!ids.length) return [];

            const users = await User.find({ accountId: { $in: ids } }).lean();
            const userMap = new Map(users.map((u) => [u.accountId, u]));

            const results = await Promise.all(
                ids.map(async (accountId) => {
                    const friendUser = userMap.get(accountId);
                    if (!friendUser) return null;

                    let avatarHash = null;
                    try {
                        if (friendUser.discordId) {
                            const discordClient = req.client || global.discordClient || global.client;
                            if (discordClient && discordClient.users && typeof discordClient.users.fetch === 'function') {
                                const discordUser = await discordClient.users.fetch(friendUser.discordId);
                                avatarHash = discordUser?.avatar;
                            }
                        }
                    } catch (discordErr) {
                        // Ignore — Discord lookup is best-effort only.
                    }

                    const presence = getPresence(friendUser.accountId);

                    return {
                        accountId: friendUser.accountId,
                        username: friendUser.username,
                        discordId: friendUser.discordId || null,
                        avatarHash: avatarHash,
                        online: presence.online,
                        away: presence.away,
                        status: presence.status
                    };
                })
            );

            return results.filter(Boolean);
        };

        const [accepted, incoming, outgoing] = await Promise.all([
            hydrate(list.accepted),
            hydrate(list.incoming),
            hydrate(list.outgoing)
        ]);

        return res.status(200).json({ accepted, incoming, outgoing });

    } catch (err) {
        log.error('Launcher Friends Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher friend request accept (re-authenticates with email/password, same as login)
app.post("/api/launcher/friends/accept", async (req, res) => {
    const { email, password, accountId } = req.body;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (!accountId) return res.status(400).send('Missing accountId.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        // Make sure the request actually exists in the current user's incoming list.
        const myFriends = await Friends.findOne({ accountId: user.accountId });
        if (!myFriends) return res.status(404).send('No pending request from this user.');

        const hasIncoming = (myFriends.list?.incoming || []).some((entry) => toAccountId(entry) === accountId);
        if (!hasIncoming) return res.status(404).send('No pending request from this user.');

        // Remove from my incoming, add to my accepted.
        myFriends.list.incoming = (myFriends.list.incoming || []).filter((entry) => toAccountId(entry) !== accountId);
        if (!(myFriends.list.accepted || []).some((entry) => toAccountId(entry) === accountId)) {
            myFriends.list.accepted = [...(myFriends.list.accepted || []), { accountId, created: new Date() }];
        }
        myFriends.markModified('list');
        await myFriends.save();

        // Mirror the change on the other user's document: remove from their outgoing, add to their accepted.
        const theirFriends = await Friends.findOne({ accountId: accountId });
        if (theirFriends) {
            theirFriends.list.outgoing = (theirFriends.list.outgoing || []).filter((entry) => toAccountId(entry) !== user.accountId);
            if (!(theirFriends.list.accepted || []).some((entry) => toAccountId(entry) === user.accountId)) {
                theirFriends.list.accepted = [...(theirFriends.list.accepted || []), { accountId: user.accountId, created: new Date() }];
            }
            theirFriends.markModified('list');
            await theirFriends.save();
        }

        notifyFriendAccepted(user.accountId, accountId);

        return res.status(200).json({ success: true, accountId });

    } catch (err) {
        log.error('Launcher Friends Accept Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher username search/autocomplete (re-authenticates with email/password, same as login)
app.get("/api/launcher/users/search", async (req, res) => {
    const { email, password, query } = req.query;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (!query || query.length < 1) return res.status(200).json({ results: [] });

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        // Escape regex special characters in the query so user input can't break the pattern.
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const matches = await User.find({
            username: { $regex: `^${escaped}`, $options: "i" },
            accountId: { $ne: user.accountId }
        })
        .limit(8)
        .select("accountId username discordId")
        .lean();

        return res.status(200).json({
            results: matches.map((m) => ({
                accountId: m.accountId,
                username: m.username,
                discordId: m.discordId || null
            }))
        });

    } catch (err) {
        log.error('Launcher User Search Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher friend request send (re-authenticates with email/password, same as login)
app.post("/api/launcher/friends/add", async (req, res) => {
    const { email, password, username } = req.body;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (!username) return res.status(400).send('Missing username.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const targetUser = await User.findOne({ username: username });
        if (!targetUser) return res.status(404).send('Player not found.');
        if (targetUser.accountId === user.accountId) return res.status(400).send("You can't add yourself.");

        let myFriends = await Friends.findOne({ accountId: user.accountId });
        if (!myFriends) myFriends = new Friends({ accountId: user.accountId, list: { accepted: [], incoming: [], outgoing: [], blocked: [] } });
        if (!myFriends.list) myFriends.list = { accepted: [], incoming: [], outgoing: [], blocked: [] };

        const alreadyFriends = (myFriends.list.accepted || []).some((entry) => toAccountId(entry) === targetUser.accountId);
        if (alreadyFriends) return res.status(400).send('Already friends with this player.');

        const alreadyOutgoing = (myFriends.list.outgoing || []).some((entry) => toAccountId(entry) === targetUser.accountId);
        if (alreadyOutgoing) return res.status(400).send('Friend request already sent.');

        const isIncoming = (myFriends.list.incoming || []).some((entry) => toAccountId(entry) === targetUser.accountId);
        if (isIncoming) return res.status(400).send('This player already sent you a request — check your incoming requests.');

        // Add to my outgoing list.
        myFriends.list.outgoing = [...(myFriends.list.outgoing || []), { accountId: targetUser.accountId, created: new Date() }];
        myFriends.markModified('list');
        await myFriends.save();

        // Add to their incoming list.
        let theirFriends = await Friends.findOne({ accountId: targetUser.accountId });
        if (!theirFriends) theirFriends = new Friends({ accountId: targetUser.accountId, list: { accepted: [], incoming: [], outgoing: [], blocked: [] } });
        if (!theirFriends.list) theirFriends.list = { accepted: [], incoming: [], outgoing: [], blocked: [] };

        const theyAlreadyHaveIncoming = (theirFriends.list.incoming || []).some((entry) => toAccountId(entry) === user.accountId);
        if (!theyAlreadyHaveIncoming) {
            theirFriends.list.incoming = [...(theirFriends.list.incoming || []), { accountId: user.accountId, created: new Date() }];
        }
        theirFriends.markModified('list');
        await theirFriends.save();

        notifyFriendRequestSent(user.accountId, targetUser.accountId);

        return res.status(200).json({
            success: true,
            accountId: targetUser.accountId,
            username: targetUser.username,
            discordId: targetUser.discordId || null
        });

    } catch (err) {
        log.error('Launcher Friends Add Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher friend request decline (re-authenticates with email/password, same as login)
app.post("/api/launcher/friends/decline", async (req, res) => {
    const { email, password, accountId } = req.body;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (!accountId) return res.status(400).send('Missing accountId.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const myFriends = await Friends.findOne({ accountId: user.accountId });
        if (!myFriends) return res.status(404).send('No pending request from this user.');

        const hasIncoming = (myFriends.list?.incoming || []).some((entry) => toAccountId(entry) === accountId);
        if (!hasIncoming) return res.status(404).send('No pending request from this user.');

        // Remove the request from my incoming list.
        myFriends.list.incoming = (myFriends.list.incoming || []).filter((entry) => toAccountId(entry) !== accountId);
        myFriends.markModified('list');
        await myFriends.save();

        // Remove it from the other user's outgoing list too.
        const theirFriends = await Friends.findOne({ accountId: accountId });
        if (theirFriends) {
            theirFriends.list.outgoing = (theirFriends.list.outgoing || []).filter((entry) => toAccountId(entry) !== user.accountId);
            theirFriends.markModified('list');
            await theirFriends.save();
        }

        notifyFriendRequestRemoved(user.accountId, accountId);

        return res.status(200).json({ success: true, accountId });

    } catch (err) {
        log.error('Launcher Friends Decline Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

//Api for launcher friend removal (re-authenticates with email/password, same as login)
app.post("/api/launcher/friends/remove", async (req, res) => {
    const { email, password, accountId } = req.body;

    if (!email || !password) return res.status(400).send('Missing email or password.');
    if (!accountId) return res.status(400).send('Missing accountId.');

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).send('User not found.');

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send('Invalid password.');

        const myFriends = await Friends.findOne({ accountId: user.accountId });
        if (!myFriends) return res.status(404).send('You are not friends with this user.');

        const wasFriends = (myFriends.list?.accepted || []).some((entry) => toAccountId(entry) === accountId);
        if (!wasFriends) return res.status(404).send('You are not friends with this user.');

        // Remove from my accepted list.
        myFriends.list.accepted = (myFriends.list.accepted || []).filter((entry) => toAccountId(entry) !== accountId);
        myFriends.markModified('list');
        await myFriends.save();

        // Remove from their accepted list too.
        const theirFriends = await Friends.findOne({ accountId: accountId });
        if (theirFriends) {
            theirFriends.list.accepted = (theirFriends.list.accepted || []).filter((entry) => toAccountId(entry) !== user.accountId);
            theirFriends.markModified('list');
            await theirFriends.save();
        }

        notifyFriendRemoved(user.accountId, accountId);

        return res.status(200).json({ success: true, accountId });

    } catch (err) {
        log.error('Launcher Friends Remove Api Error:', err);
        return res.status(500).send('Internal Server Error');
    }
});

module.exports = app;

// Pushes our own "in_launcher"/"in_game" status to every accepted friend who currently has
// a live XMPP (in-game) session, so it shows up in their native in-game friends list too —
// not just in the custom launcher's own Friends tab. Only called when the status changes.
async function broadcastLauncherPresence(accountId, status) {
    if (!global.Clients) return;

    try {
        const friendsDoc = await Friends.findOne({ accountId }).lean();
        const friendIds = (friendsDoc?.list?.accepted || []).map(toAccountId).filter(Boolean);
        if (!friendIds.length) return;

        // We're not connected via XMPP ourselves (that's the whole point of this fallback),
        // so build the same kind of JID the real game client would use for us.
        const fromJid = `${accountId}@${global.xmppDomain}`;

        friendIds.forEach((friendAccountId) => {
            const toClient = global.Clients.find((c) => c.accountId === friendAccountId);
            if (!toClient) return; // friend isn't in-game right now — nothing to push to

            toClient.client.send(XMLBuilder.create("presence")
                .attribute("to", toClient.jid)
                .attribute("xmlns", "jabber:client")
                .attribute("from", fromJid)
                .attribute("type", "available")
                .element("status", JSON.stringify({ Status: status }))
                .up()
                .toString());
        });
    } catch (err) {
        log.error('Broadcast Launcher Presence Error: ' + err);
    }
}

// Notifies an online game client that a new incoming friend request arrived.
function notifyFriendRequestSent(fromAccountId, toAccountId) {
    if (!global.Clients) return;

    const toClient = global.Clients.find((c) => c.accountId === toAccountId);
    if (!toClient) return;

    toClient.client.send(XMLBuilder.create("message")
        .attribute("from", "xmpp-admin@prod.ol.epicgames.com")
        .attribute("to", toClient.jid)
        .attribute("xmlns", "jabber:client")
        .element("body", JSON.stringify({
            type: "com.epicgames.friends.core.apiobjects.Friend",
            timestamp: new Date().toISOString(),
            payload: {
                accountId: fromAccountId,
                status: "PENDING",
                direction: "INBOUND",
                created: new Date().toISOString(),
                favorite: false
            }
        })).up().toString());
}

// Notifies an online game client (via XMPP) that a friendship was accepted,
// and exchanges presence so each party shows up online to the other immediately.
function notifyFriendAccepted(selfAccountId, otherAccountId) {
    if (!global.Clients) return;

    const selfClient = global.Clients.find((c) => c.accountId === selfAccountId);
    const otherClient = global.Clients.find((c) => c.accountId === otherAccountId);

    const sendFriendEvent = (toClient, friendAccountId) => {
        if (!toClient) return;
        toClient.client.send(XMLBuilder.create("message")
            .attribute("from", "xmpp-admin@prod.ol.epicgames.com")
            .attribute("to", toClient.jid)
            .attribute("xmlns", "jabber:client")
            .element("body", JSON.stringify({
                type: "com.epicgames.friends.core.apiobjects.Friend",
                timestamp: new Date().toISOString(),
                payload: {
                    accountId: friendAccountId,
                    status: "ACCEPTED",
                    direction: "OUTBOUND",
                    created: new Date().toISOString(),
                    favorite: false
                }
            })).up().toString());
    };

    sendFriendEvent(selfClient, otherAccountId);
    sendFriendEvent(otherClient, selfAccountId);

    // Exchange presence so they show up online to each other right away, if both are connected.
    if (selfClient && otherClient) {
        const sendPresence = (fromClient, toClient) => {
            let xml = XMLBuilder.create("presence")
                .attribute("to", toClient.jid)
                .attribute("xmlns", "jabber:client")
                .attribute("from", fromClient.jid)
                .attribute("type", "available");

            if (fromClient.lastPresenceUpdate?.away) {
                xml = xml.element("show", "away").up().element("status", fromClient.lastPresenceUpdate.status || "{}").up();
            } else {
                xml = xml.element("status", fromClient.lastPresenceUpdate?.status || "{}").up();
            }
            toClient.client.send(xml.toString());
        };

        sendPresence(selfClient, otherClient);
        sendPresence(otherClient, selfClient);
    }
}

// Notifies an online game client that an incoming friend request was declined / an outgoing one was cancelled.
function notifyFriendRequestRemoved(selfAccountId, otherAccountId) {
    if (!global.Clients) return;

    const sendRemovalEvent = (toAccountId, removedAccountId) => {
        const toClient = global.Clients.find((c) => c.accountId === toAccountId);
        if (!toClient) return;

        toClient.client.send(XMLBuilder.create("message")
            .attribute("from", "xmpp-admin@prod.ol.epicgames.com")
            .attribute("to", toClient.jid)
            .attribute("xmlns", "jabber:client")
            .element("body", JSON.stringify({
                type: "com.epicgames.friends.core.apiobjects.FriendRemoval",
                timestamp: new Date().toISOString(),
                payload: {
                    accountId: removedAccountId,
                    reason: "REJECTED"
                }
            })).up().toString());
    };

    sendRemovalEvent(selfAccountId, otherAccountId);
    sendRemovalEvent(otherAccountId, selfAccountId);
}

// Notifies an online game client that an existing friendship was removed.
function notifyFriendRemoved(selfAccountId, otherAccountId) {
    if (!global.Clients) return;

    const sendRemovalEvent = (toAccountId, removedAccountId) => {
        const toClient = global.Clients.find((c) => c.accountId === toAccountId);
        if (!toClient) return;

        toClient.client.send(XMLBuilder.create("message")
            .attribute("from", "xmpp-admin@prod.ol.epicgames.com")
            .attribute("to", toClient.jid)
            .attribute("xmlns", "jabber:client")
            .element("body", JSON.stringify({
                type: "com.epicgames.friends.core.apiobjects.FriendRemoval",
                timestamp: new Date().toISOString(),
                payload: {
                    accountId: removedAccountId,
                    reason: "DELETED"
                }
            })).up().toString());

        // Also tell their client to stop showing presence for the removed friend.
        toClient.client.send(XMLBuilder.create("presence")
            .attribute("to", toClient.jid)
            .attribute("xmlns", "jabber:client")
            .attribute("from", `${removedAccountId}@${global.xmppDomain}`)
            .attribute("type", "unavailable").toString());
    };

    sendRemovalEvent(selfAccountId, otherAccountId);
    sendRemovalEvent(otherAccountId, selfAccountId);
}