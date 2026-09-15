const WebSocket = require("ws").Server;
const XMLBuilder = require("xmlbuilder");
const XMLParser = require("xml-parser");
const express = require("express");
const fs = require("fs");
const https = require("https");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

const app = express();
const log = require("../structs/log.js");
const functions = require("../structs/functions.js");
const User = require("../model/user.js");
const Friends = require("../model/friends.js");
const matchmaker = require("../matchmaker/matchmaker.js")

const port = config.bEnableHTTPS ? 443 : 80;
let wss;

let httpsOptions;
if (config.bEnableHTTPS) {
    httpsOptions = {
        cert: fs.readFileSync(config.ssl.cert),
        ca: fs.existsSync(config.ssl.ca) ? fs.readFileSync(config.ssl.ca) : undefined,
        key: fs.readFileSync(config.ssl.key)
    };
}

if (config.bEnableHTTPS) {
    const httpsServer = https.createServer(httpsOptions, app);
    wss = new WebSocket({ server: httpsServer });
    httpsServer.listen(port, () => {
        log.xmpp(`XMPP and Matchmaker started listening on port ${port} (SSL Enabled)`);
        global.matchmakerListening = true;
        global.matchmakerStatusError = false;
        if (global.setServerStatus) global.setServerStatus("Match Maker", "Online").catch(() => {});
    });
} else {
    wss = new WebSocket({ server: app.listen(port) });
    log.xmpp(`XMPP and Matchmaker started listening on port ${port} (SSL Disabled)`);
    global.matchmakerListening = true;
    global.matchmakerStatusError = false;
    if (global.setServerStatus) global.setServerStatus("Match Maker", "Online").catch(() => {});
}

global.xmppDomain = "prod.ol.epicgames.com";
global.Clients = [];
global.MUCs = {};
global.matchmakerListening = false;
global.matchmakerStatusError = false;
global.pendingPresenceOffline = global.pendingPresenceOffline || new Map();

app.get("/", (req, res) => {
    res.type("application/json");
    res.header("Access-Control-Allow-Origin", "*");

    let data = JSON.stringify({
        "Clients": {
            "amount": global.Clients.length,
            "clients": global.Clients.map(i => i.displayName)
        }
    }, null, 2);

    res.send(data);
});

app.get("/clients", (req, res) => {
    res.type("application/json");
    
    let data = JSON.stringify({
        "amount": global.Clients.length,
        "clients": global.Clients.map(i => i.displayName)
    }, null, 2);
    
    res.send(data);
});

wss.on('listening', () => {
    
});

wss.on('error', (err) => {
    console.error("WebSocket server error:", err);
    global.matchmakerStatusError = true;
    global.matchmakerListening = false;
    if (global.setServerStatus) global.setServerStatus("Match Maker", "Error").catch(() => {});
});

wss.on('connection', async (ws, req) => {
    ws.on('error', () => {});

    // Start matchmaker if it's not connecting for xmpp.
    if (!ws.protocol || ws.protocol.toLowerCase() != "xmpp") return matchmaker.handleExternalConnection(ws, req);

    let joinedMUCs = [];
    let accountId = "";
    let displayName = "";
    let token = "";
    let jid = "";
    let resource = "";
    let ID = "";
    let Authenticated = false;
    let clientExists = false;
    let connectionClosed = false;

    let isServer = false;

    ws.on('close', () => {
        if (connectionClosed) return;
        connectionClosed = true;

        if (Authenticated) {
            matchmaker.handleHostLogout(displayName, isServer);
        }
    });

    ws.on('message', async (message) => {
        if (Buffer.isBuffer(message)) message = message.toString();

        const msg = XMLParser(message);
        if (!msg || !msg.root || !msg.root.name) return Error(ws);

        switch (msg.root.name) {
            case "open":
                if (!ID) ID = functions.MakeID();

                ws.send(XMLBuilder.create("open")
                .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-framing")
                .attribute("from", global.xmppDomain)
                .attribute("id", ID)
                .attribute("version", "1.0")
                .attribute("xml:lang", "en").toString());
                
                if (Authenticated) {
                    ws.send(XMLBuilder.create("stream:features").attribute("xmlns:stream", "http://etherx.jabber.org/streams")
                    .element("ver").attribute("xmlns", "urn:xmpp:features:rosterver").up()
                    .element("starttls").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-tls").up()
                    .element("bind").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-bind").up()
                    .element("compression").attribute("xmlns", "http://jabber.org/features/compress")
                    .element("method", "zlib").up().up()
                    .element("session").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-session").up().toString());
                } else {
                    ws.send(XMLBuilder.create("stream:features").attribute("xmlns:stream", "http://etherx.jabber.org/streams")
                    .element("mechanisms").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-sasl")
                    .element("mechanism", "PLAIN").up().up()
                    .element("ver").attribute("xmlns", "urn:xmpp:features:rosterver").up()
                    .element("starttls").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-tls").up()
                    .element("compression").attribute("xmlns", "http://jabber.org/features/compress")
                    .element("method", "zlib").up().up()
                    .element("auth").attribute("xmlns", "http://jabber.org/features/iq-auth").up().toString());
                }
            break;

            case "auth":
                if (!ID) return;
                if (accountId) return;
                if (!msg.root.content) return Error(ws);
                if (!functions.DecodeBase64(msg.root.content).includes("\u0000")) return Error(ws);

                let decodedBase64 = functions.DecodeBase64(msg.root.content).split("\u0000");

                const accessTokens = Array.isArray(global.accessTokens) ? global.accessTokens : [];
                const clients = Array.isArray(global.Clients) ? global.Clients : [];

                let object = accessTokens.find(i => i.token == decodedBase64[2]);
                if (!object) return Error(ws);

                if (clients.find(i => i.accountId == object.accountId)) return Error(ws);

                let user = await User.findOne({ accountId: object.accountId, banned: false }).lean();
                if (!user) return Error(ws);

                accountId = user.accountId;
                displayName = user.username;
                token = object.token;
                isServer = user.isServer === true;

                if (decodedBase64 && accountId && displayName && token && decodedBase64.length == 3) {
                    Authenticated = true;
                    log.xmpp(`An xmpp client with the displayName ${displayName} has logged in.`);

                    matchmaker.handleHostLogin(displayName, isServer);

                    ws.send(XMLBuilder.create("success").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-sasl").toString());
                } else return Error(ws);
            break;

            case "iq":
                if (!ID) return;

                switch (msg.root.attributes.id) {
                    case "_xmpp_bind1":
                        if (resource || !accountId) return;
                        if (!msg.root.children.find(i => i.name == "bind")) return;

                        if (global.Clients.find(i => i.accountId == accountId)) return Error(ws);

                        let findResource = msg.root.children.find(i => i.name == "bind").children.find(i => i.name == "resource");

                        if (!findResource) return;
                        if (!findResource.content) return;

                        resource = findResource.content;
                        jid = `${accountId}@${global.xmppDomain}/${resource}`;

                        ws.send(XMLBuilder.create("iq")
                        .attribute("to", jid)
                        .attribute("id", "_xmpp_bind1")
                        .attribute("xmlns", "jabber:client")
                        .attribute("type", "result")
                        .element("bind")
                        .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-bind")
                        .element("jid", jid).up().up().toString());
                    break;

                    case "_xmpp_session1":
                        if (!Authenticated || !accountId || !resource || !jid) return Error(ws);

                        ws.send(XMLBuilder.create("iq")
                        .attribute("to", jid)
                        .attribute("from", global.xmppDomain)
                        .attribute("id", "_xmpp_session1")
                        .attribute("xmlns", "jabber:client")
                        .attribute("type", "result").toString());

                        await getPresenceFromFriends(ws, accountId, jid);
                    break;

                    default:
                        if (!clientExists) return Error(ws);

                        ws.send(XMLBuilder.create("iq")
                        .attribute("to", jid)
                        .attribute("from", global.xmppDomain)
                        .attribute("id", msg.root.attributes.id)
                        .attribute("xmlns", "jabber:client")
                        .attribute("type", "result").toString());
                }
            break;

            case "message":
                if (!clientExists) return Error(ws);

                let findBody = msg.root.children.find(i => i.name == "body");

                if (!findBody || !findBody.content) return;

                let body = findBody.content;

                switch (msg.root.attributes.type) {
                    case "chat":
                        if (!msg.root.attributes.to) return;
                        if (body.length >= 300) return;

                        let receiver = global.Clients.find(i => i.jid.split("/")[0] == msg.root.attributes.to);

                        if (!receiver) return;
                        if (receiver.accountId == accountId) return;

                        receiver.client.send(XMLBuilder.create("message")
                        .attribute("to", receiver.jid)
                        .attribute("from", jid)
                        .attribute("xmlns", "jabber:client")
                        .attribute("type", "chat")
                        .element("body", body).up().toString());
                    return;

                    case "groupchat":
                        if (!msg.root.attributes.to) return;
                        if (body.length >= 300) return;

                        let roomName = msg.root.attributes.to.split("@")[0];

                        let MUC = global.MUCs[roomName];
                        if (!MUC) return;

                        if (!MUC.members.find(i => i.accountId == accountId)) return;

                        MUC.members.forEach(member => {
                            let ClientData = global.Clients.find(i => i.accountId == member.accountId);
                            if (!ClientData) return;

                            ClientData.client.send(XMLBuilder.create("message")
                            .attribute("to", ClientData.jid)
                            .attribute("from", getMUCmember(roomName, displayName, accountId, resource))
                            .attribute("xmlns", "jabber:client")
                            .attribute("type", "groupchat")
                            .element("body", body).up().toString());
                        });
                    return;
                }

                if (isJSON(body)) {
                    let bodyJSON = JSON.parse(body);

                    if (Array.isArray(bodyJSON)) return;
                    if (typeof bodyJSON.type != "string") return;
                    if (!msg.root.attributes.to) return;
                    if (!msg.root.attributes.id) return;

                    sendXmppMessageToClient(jid, msg, body);
                }
            break;

            case "presence":
                if (!clientExists) return Error(ws);

                switch (msg.root.attributes.type) {
                    case "unavailable":
                        if (!msg.root.attributes.to) return;

                        if (msg.root.attributes.to.endsWith(`@muc.${global.xmppDomain}`) || msg.root.attributes.to.split("/")[0].endsWith(`@muc.${global.xmppDomain}`)) {
                            if (!msg.root.attributes.to.toLowerCase().startsWith("party-")) return;
                            
                            let roomName = msg.root.attributes.to.split("@")[0];
                            
                            if (!global.MUCs[roomName]) return;
                            
                            let memberIndex = global.MUCs[roomName].members.findIndex(i => i.accountId == accountId);
                            if (memberIndex != -1) {
                                global.MUCs[roomName].members.splice(memberIndex, 1);
                                joinedMUCs.splice(joinedMUCs.indexOf(roomName), 1);
                            }

                            ws.send(XMLBuilder.create("presence")
                            .attribute("to", jid)
                            .attribute("from", getMUCmember(roomName, displayName, accountId, resource))
                            .attribute("xmlns", "jabber:client")
                            .attribute("type", "unavailable")
                            .element("x").attribute("xmlns", "http://jabber.org/protocol/muc#user")
                            .element("item")
                            .attribute("nick", getMUCmember(roomName, displayName, accountId, resource).replace(`${roomName}@muc.${global.xmppDomain}/`, ""))
                            .attribute("jid", jid)
                            .attribute("role", "none").up()
                            .element("status").attribute("code", "110").up()
                            .element("status").attribute("code", "100").up()
                            .element("status").attribute("code", "170").up().up().toString());
                            return;
                        }
                    break;

                    default:
                        if (msg.root.children.find(i => i.name == "muc:x") || msg.root.children.find(i => i.name == "x")) {
                            if (!msg.root.attributes.to) return;
                            
                            let roomName = msg.root.attributes.to.split("@")[0];
    
                            if (!global.MUCs[roomName]) global.MUCs[roomName] = { members: [] };
    
                            if (global.MUCs[roomName].members.find(i => i.accountId == accountId)) return;
    
                            global.MUCs[roomName].members.push({ accountId: accountId });
    
                            joinedMUCs.push(roomName);
    
                            ws.send(XMLBuilder.create("presence")
                            .attribute("to", jid)
                            .attribute("from", getMUCmember(roomName, displayName, accountId, resource))
                            .attribute("xmlns", "jabber:client")
                            .element("x").attribute("xmlns", "http://jabber.org/protocol/muc#user")
                            .element("item")
                            .attribute("nick", getMUCmember(roomName, displayName, accountId, resource).replace(`${roomName}@muc.${global.xmppDomain}/`, ""))
                            .attribute("jid", jid)
                            .attribute("role", "participant")
                            .attribute("affiliation", "none").up()
                            .element("status").attribute("code", "110").up()
                            .element("status").attribute("code", "100").up()
                            .element("status").attribute("code", "170").up()
                            .element("status").attribute("code", "201").up().up().toString());
    
                            global.MUCs[roomName].members.forEach(member => {
                                let ClientData = global.Clients.find(i => i.accountId == member.accountId);
                                if (!ClientData) return;
    
                                ws.send(XMLBuilder.create("presence")
                                .attribute("from", getMUCmember(roomName, ClientData.displayName, ClientData.accountId, ClientData.resource))
                                .attribute("to", jid)
                                .attribute("xmlns", "jabber:client")
                                .element("x")
                                .attribute("xmlns", "http://jabber.org/protocol/muc#user")
                                .element("item")
                                .attribute("nick", getMUCmember(roomName, ClientData.displayName, ClientData.accountId, ClientData.resource).replace(`${roomName}@muc.${global.xmppDomain}/`, ""))
                                .attribute("jid", ClientData.jid)
                                .attribute("role", "participant")
                                .attribute("affiliation", "none").up().up().toString());
    
                                if (accountId == ClientData.accountId) return;
    
                                ClientData.client.send(XMLBuilder.create("presence")
                                .attribute("from", getMUCmember(roomName, displayName, accountId, resource))
                                .attribute("to", ClientData.jid)
                                .attribute("xmlns", "jabber:client")
                                .element("x")
                                .attribute("xmlns", "http://jabber.org/protocol/muc#user")
                                .element("item")
                                .attribute("nick", getMUCmember(roomName, displayName, accountId, resource).replace(`${roomName}@muc.${global.xmppDomain}/`, ""))
                                .attribute("jid", jid)
                                .attribute("role", "participant")
                                .attribute("affiliation", "none").up().up().toString());
                            });
                        return;
                    }
                }

                let findStatus = msg.root.children.find(i => i.name == "status");

                if (!findStatus || !findStatus.content) return;
                if (!isJSON(findStatus.content)) return;
                if (Array.isArray(JSON.parse(findStatus.content))) return;

                let status = findStatus.content;
                let away = msg.root.children.find(i => i.name == "show") ? true : false;

                await updatePresenceForFriends(ws, status, away, false);
                functions.getPresenceFromUser(accountId, accountId, false);
            break;
        }

        if (!clientExists && !connectionClosed) {
            if (accountId && displayName && token && jid && ID && resource && Authenticated) {
                global.Clients.push({
                    client: ws,
                    accountId: accountId,
                    displayName: displayName,
                    token: token,
                    jid: jid,
                    resource: resource,
                    lastPresenceUpdate: {
                        away: false,
                        status: "{}" 
                    } 
                });

                clientExists = true;
                global.updateOnlinePlayersMessage?.().catch(() => {});
            }
        }
    });
    
    ws.on('close', () => { connectionClosed = true; clientExists = false; RemoveClient(ws, joinedMUCs); });
});

function Error(ws) {
    ws.send(XMLBuilder.create("close").attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-framing").toString());
    ws.close();
}

global.handlePartyMemberDisconnect = function (accountId) {
    if (!accountId || !global.parties || typeof global.parties !== "object") return false;

    let removedAny = false;

    Object.keys(global.parties).forEach((partyId) => {
        const party = global.parties[partyId];
        if (!party || !Array.isArray(party.members)) return;

        const memberIndex = party.members.findIndex((member) => member && member.account_id == accountId);
        if (memberIndex === -1) return;

        removedAny = true;

        const member = party.members[memberIndex];
        const remainingMembers = party.members.filter((item, index) => index !== memberIndex);

        if (remainingMembers.length === 0) {
            delete global.parties[partyId];
            return;
        }

        const captain = remainingMembers.find((item) => item.role === "CAPTAIN") || remainingMembers[0];
        if (captain && captain.role !== "CAPTAIN") captain.role = "CAPTAIN";

        const meta = party.meta || {};
        party.meta = meta;

        const v = meta['Default:RawSquadAssignments_j'] ? 'Default:RawSquadAssignments_j' : 'RawSquadAssignments_j';
        if (meta[v]) {
            try {
                const rsa = JSON.parse(meta[v]);
                const assignmentIndex = (rsa.RawSquadAssignments || []).findIndex((assignment) => assignment.memberId == accountId);
                if (assignmentIndex !== -1) {
                    rsa.RawSquadAssignments.splice(assignmentIndex, 1);
                    meta[v] = JSON.stringify(rsa);
                }
            } catch (error) {}
        }
        party.meta = meta;

        if (global.vcParticipants && global.vcParticipants[partyId]) {
            global.vcParticipants[partyId] = global.vcParticipants[partyId].filter((participant) => participant?.puid !== accountId);
        }

        party.members = remainingMembers;
        party.updated_at = new Date().toISOString();
        party.updatedAt = party.updated_at;
        global.parties[partyId] = party;

        remainingMembers.forEach((remainingMember) => {
            functions.sendXmppMessageToId({
                account_id: accountId,
                member_state_update: {},
                ns: "Fortnite",
                party_id: party.id,
                revision: party.revision || 0,
                sent: new Date().toISOString(),
                type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
            }, remainingMember.account_id);
        });
    });

    return removedAny;
};

function RemoveClient(ws, joinedMUCs) {
    let clientIndex = global.Clients.findIndex(i => i.client == ws);
    let client = global.Clients[clientIndex];
    
    if (clientIndex == -1) return;

    let ClientStatus = JSON.parse(client.lastPresenceUpdate.status);

    scheduleGracefulPresenceOffline(client);
    global.handlePartyMemberDisconnect?.(client.accountId);

    global.Clients.splice(clientIndex, 1);
    global.updateOnlinePlayersMessage?.().catch(() => {});

    for (let roomName of joinedMUCs) {
        if (global.MUCs[roomName]) {
            let memberIndex = global.MUCs[roomName].members.findIndex(i => i.accountId == client.accountId);

            if (memberIndex != -1) global.MUCs[roomName].members.splice(memberIndex, 1);
        }
    }

    let partyId = "";

    try {
        switch (true) {
            case (!ClientStatus.Properties): break;
            case (isObject(ClientStatus.Properties)): {
                for (let key in ClientStatus.Properties) {
                    if (key.toLowerCase().startsWith("party.joininfo")) {
                        if (isObject(ClientStatus.Properties[key])) partyId = ClientStatus.Properties[key].partyId;
                    }
                }
            }
        }
    } catch {}

    if (partyId && typeof partyId == "string") {
        global.Clients.forEach(ClientData => {
            if (client.accountId == ClientData.accountId) return;

            ClientData.client.send(XMLBuilder.create("message")
            .attribute("id", functions.MakeID().replace(/-/ig, "").toUpperCase())
            .attribute("from", client.jid)
            .attribute("xmlns", "jabber:client")
            .attribute("to", ClientData.jid)
            .element("body", JSON.stringify({
                "type": "com.epicgames.party.memberexited",
                "payload": {
                    "partyId": partyId,
                    "memberId": client.accountId,
                    "wasKicked": false
                },
                "timestamp": new Date().toISOString()
            })).up().toString());
        });
    }

    log.xmpp(`An xmpp client with the displayName ${client.displayName} has logged out.`);
}

global.kickUserFromGame = function (accountId, reason = "Account banned") {
    if (!accountId || !Array.isArray(global.Clients)) return false;

    const clients = global.Clients.filter((client) => client.accountId === accountId);
    clients.forEach((client) => {
        try {
            if (client.client.readyState === 1) {
                client.client.send(XMLBuilder.create("close")
                    .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-framing")
                    .toString());
            }
            client.client.close(4003, reason);
        } catch (error) {
            log.debug(`Failed to close banned user's game session ${accountId}: ${error.message}`);
        }
    });

    return clients.length > 0;
};

function clearPendingPresenceOffline(accountId) {
    const pending = global.pendingPresenceOffline?.get(accountId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    if (pending) global.pendingPresenceOffline.delete(accountId);
}

function scheduleGracefulPresenceOffline(client) {
    if (!client || !global.pendingPresenceOffline) return;

    clearPendingPresenceOffline(client.accountId);

    const lastStatus = client.lastPresenceUpdate?.status || "{}";
    const away = !!client.lastPresenceUpdate?.away;

    const pending = {
        timeout: setTimeout(() => {
            global.pendingPresenceOffline.delete(client.accountId);
            sendPresenceToFriends(client.accountId, client.jid, lastStatus, away, true).catch(() => {});
        }, 15000)
    };

    global.pendingPresenceOffline.set(client.accountId, pending);
    sendPresenceToFriends(client.accountId, client.jid, lastStatus, away, false).catch(() => {});
}

async function getPresenceFromFriends(ws, accountId, jid) {
    let friends = await Friends.findOne({ accountId: accountId }).lean();
    if (!friends) return;

    let accepted = friends.list.accepted;

    accepted.forEach(friend => {
        let ClientData = global.Clients.find(i => i.accountId == friend.accountId);
        if (!ClientData) return;

        let xml = XMLBuilder.create("presence")
        .attribute("to", jid)
        .attribute("xmlns", "jabber:client")
        .attribute("from", ClientData.jid)
        .attribute("type", "available")

        if (ClientData.lastPresenceUpdate.away) xml = xml.element("show", "away").up().element("status", ClientData.lastPresenceUpdate.status).up();
        else xml = xml.element("status", ClientData.lastPresenceUpdate.status).up();

        ws.send(xml.toString());
    });
}

async function updatePresenceForFriends(ws, body, away, offline) {
    let SenderIndex = global.Clients.findIndex(i => i.client == ws);
    let SenderData = global.Clients[SenderIndex];

    if (SenderIndex == -1) return;

    global.Clients[SenderIndex].lastPresenceUpdate.away = away;
    global.Clients[SenderIndex].lastPresenceUpdate.status = body;
    clearPendingPresenceOffline(SenderData.accountId);

    await sendPresenceToFriends(SenderData.accountId, SenderData.jid, body, away, offline);
}

async function sendPresenceToFriends(senderAccountId, senderJid, body, away, offline) {
    const friends = await Friends.findOne({ accountId: senderAccountId });
    if (!friends?.list?.accepted) return;

    const accepted = friends.list.accepted;

    accepted.forEach(friend => {
        let ClientData = global.Clients.find(i => i.accountId == friend.accountId);
        if (!ClientData) return;

        let xml = XMLBuilder.create("presence")
        .attribute("to", ClientData.jid)
        .attribute("xmlns", "jabber:client")
        .attribute("from", senderJid)
        .attribute("type", offline ? "unavailable" : "available");

        if (away) xml = xml.element("show", "away").up().element("status", body).up();
        else xml = xml.element("status", body).up();

        ClientData.client.send(xml.toString());
    });
}

function sendXmppMessageToClient(senderJid, msg, body) {
    if (typeof body == "object") body = JSON.stringify(body);

    let receiver = global.Clients.find(i => i.jid.split("/")[0] == msg.root.attributes.to || i.jid == msg.root.attributes.to);
    if (!receiver) return;

    receiver.client.send(XMLBuilder.create("message")
    .attribute("from", senderJid)
    .attribute("id", msg.root.attributes.id)
    .attribute("to", receiver.jid)
    .attribute("xmlns", "jabber:client")
    .element("body", `${body}`).up().toString());
}

function getMUCmember(roomName, displayName, accountId, resource) {
    return `${roomName}@muc.${global.xmppDomain}/${encodeURI(displayName)}:${accountId}:${resource}`;
}

function isObject(value) {
    if (typeof value == "object" && !Array.isArray(value)) return true;
    else return false;
}

function isJSON(str) {
    try {
        JSON.parse(str)
    } catch (err) {
        return false;
    }
    return true;
}

module.exports = app;
module.exports.handlePartyMemberDisconnect = global.handlePartyMemberDisconnect;
