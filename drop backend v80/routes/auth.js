const express = require("express");
const app = express.Router();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const error = require("../structs/error.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const config = require('../Config/config.json')

const tokenCreation = require("../tokenManager/tokenCreation.js");
const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const Profiles = require("../model/profiles.js");
const matchmaker = require("../matchmaker/matchmaker.js");
const uuid = require("uuid");

const configPath = path.join(__dirname, "..", "Config", "config.json");

function readRuntimeConfig() {
    try {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (err) {
        log.error(`Failed to read auth config: ${err.message}`);
        return {};
    }
}

function parseGrantWindowDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLoginGrantSkinConfig() {
    const runtimeConfig = readRuntimeConfig();
    if (runtimeConfig.bEnableLoginGrantSkin !== true) return null;

    const templateId = String(runtimeConfig.bLoginGrantSkinTemplateId || "").trim();
    if (!templateId) return null;

    const now = new Date();
    const startDate = parseGrantWindowDate(runtimeConfig.bLoginGrantSkinStartAt);
    if (startDate && now < startDate) return null;

    const endDate = parseGrantWindowDate(runtimeConfig.bLoginGrantSkinEndAt);
    const durationDays = Number(runtimeConfig.bLoginGrantSkinDurationDays || 0);
    let resolvedEndDate = endDate;

    if (!resolvedEndDate && durationDays > 0) {
        resolvedEndDate = new Date(now.getTime());
        resolvedEndDate.setDate(resolvedEndDate.getDate() + durationDays);
    }

    if (resolvedEndDate && now > resolvedEndDate) return null;

    return { templateId, startDate: startDate || now, endDate: resolvedEndDate };
}

async function applyLoginGrantSkin(accountId) {
    const grantConfig = getLoginGrantSkinConfig();
    if (!grantConfig || !grantConfig.templateId) return false;

    const profiles = await Profiles.findOne({ accountId });
    if (!profiles) return false;

    if (!profiles.profiles) profiles.profiles = {};
    if (!profiles.profiles.athena) profiles.profiles.athena = {};
    if (!profiles.profiles.athena.items) profiles.profiles.athena.items = {};

    if (profiles.profiles.athena.items[grantConfig.templateId]) return false;

    profiles.profiles.athena.items[grantConfig.templateId] = {
        templateId: grantConfig.templateId,
        attributes: { item_seen: false },
        quantity: 1
    };

    await profiles.save();
    log.admin(`Auto-granted login skin ${grantConfig.templateId} to ${accountId}`);
    return true;
}

app.get("/epic/id/v2/sdk/accounts", async (req, res) => {
    let user = await User.findOne({ accountId: req.query.accountId, banned: false }).lean();
    if (!user) return error.createError(
        "errors.com.epicgames.account.account_not_found",
        `Sorry, we couldn't find an account for ${req.query.accountId}`, 
        [req.query.accountId], 18007, undefined, 404, res
    );
    res.json([{
        accountId: user.accountId,
        displayName: user.username,
        preferredLanguage: "en",
        linkedAccounts: [],
        cabinedMode: false,
        empty: false
    }]);
})

app.get("/register", (req, res) => {
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Epic-style Account Registration</title>
<style>
body { font-family: Arial, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
.container { width: 100%; max-width: 420px; padding: 24px; background: #181818; border: 1px solid #333; border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.35); animation: fadeInUp 0.6s ease both; }
.logo { display: block; margin: 0 auto 18px; max-width: 180px; animation: logo-pop 0.5s ease both; }
h1 { margin: 0 0 18px; font-size: 24px; text-align: center; }
label { display: block; margin-bottom: 14px; }
input { width: 100%; padding: 12px 14px; border: 1px solid #333; border-radius: 8px; background: #121212; color: #eee; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,0.12); }
button { width: 100%; padding: 12px 14px; border: none; border-radius: 8px; background: #1a73e8; color: #fff; font-size: 16px; cursor: pointer; transition: background 0.2s ease, transform 0.2s ease; }
button:hover { background: #1664c1; transform: translateY(-1px); }
small { color: #aaa; display: block; margin-top: 12px; text-align: center; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes logo-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
</style>
</head>
<body>
<div class="container">
<img src="https://i.imgur.com/74CnPwD.png" alt="Logo" class="logo">
<h1>Create an Epic-style account</h1>
<form method="POST" action="/account/api/public/register">
<label>Email address<br><input type="email" name="email" required></label>
<label>Display name<br><input type="text" name="displayName" maxlength="24" required></label>
<label>Password<br><input type="password" name="password" required></label>
<button type="submit">Create account</button>
<small>After submission, you will receive a JSON response.</small>
</form>
</div>
</body>
</html>`;

    res.send(html);
});

app.post("/account/api/public/register", async (req, res) => {
    log.debug("POST /account/api/public/register called");

    const email = typeof req.body.email == "string" ? req.body.email.trim().toLowerCase() : "";
    const displayName = typeof req.body.displayName == "string" ? req.body.displayName.trim() : "";
    const password = typeof req.body.password == "string" ? req.body.password : "";

    if (!email || !displayName || !password) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "Email, display name, and password are required.",
            [], 1013, "invalid_request", 400, res
        );
    }

    const result = await functions.registerUser(null, displayName, email, password);
    if (result.status !== 200) {
        return res.status(result.status).json({
            errorCode: "errors.com.epicgames.common.invalid_request",
            errorMessage: result.message,
            status: result.status
        });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) {
        return error.createError(
            "errors.com.epicgames.common.not_found",
            "Account could not be found after registration.",
            [], 1004, undefined, 500, res
        );
    }

    res.json({
        accountId: user.accountId,
        displayName: user.username,
        email: user.email,
        message: result.message
    });
});

app.all("/account/api/public/changeDisplayName", async (req, res) => {
    log.debug(`${req.method} /account/api/public/changeDisplayName called`);

    const input = { ...req.query, ...(req.body || {}) };
    const email = typeof input.email == "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password == "string" ? input.password : "";
    const displayNameInput = typeof input.displayName == "string" ? input.displayName : input.username;
    const displayName = typeof displayNameInput == "string" ? displayNameInput.trim() : "";

    if (!email || !password || !displayName) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "Email, password, and display name are required.",
            [], 1013, "invalid_request", 400, res
        );
    }

    const user = await User.findOne({ email });
    if (!user) {
        return error.createError(
            "errors.com.epicgames.account.account_not_found",
            "Sorry, we couldn't find an account for that email.",
            [email], 18007, undefined, 404, res
        );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return error.createError(
            "errors.com.epicgames.account.invalid_account_credentials",
            "Your e-mail and/or password are incorrect. Please check them and try again.",
            [], 18031, "invalid_grant", 400, res
        );
    }

    if (displayName.length >= 25) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "Your display name must be less than 25 characters long.",
            [], 1013, "invalid_request", 400, res
        );
    }

    if (displayName.length < 3) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "Your display name must be at least 3 characters long.",
            [], 1013, "invalid_request", 400, res
        );
    }

    // Reject only control characters and null bytes; allow Japanese, emoji, and other languages
    if (/[\n\r\t\x00-\x1F\x7F-\x9F]/.test(displayName)) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "Your display name contains invalid control characters.",
            [], 1013, "invalid_request", 400, res
        );
    }

    const safeDisplayName = functions.createSafeUsername(displayName, user.accountId);
    const existingUsername = await User.findOne({ username_lower: safeDisplayName.toLowerCase() });
    if (existingUsername && existingUsername.accountId !== user.accountId) {
        return error.createError(
            "errors.com.epicgames.common.invalid_request",
            "That display name is already in use.",
            [], 1013, "invalid_request", 400, res
        );
    }

    user.username = safeDisplayName;
    user.username_lower = safeDisplayName.toLowerCase();

    await user.updateOne({
        $set: {
            username: safeDisplayName,
            username_lower: safeDisplayName.toLowerCase()
        }
    });

    if (Array.isArray(global.refreshTokens)) {
        const refreshTokenIndex = global.refreshTokens.findIndex(i => i.accountId == user.accountId);
        if (refreshTokenIndex != -1) global.refreshTokens.splice(refreshTokenIndex, 1);
    }

    if (Array.isArray(global.accessTokens)) {
        const accessTokenIndex = global.accessTokens.findIndex(i => i.accountId == user.accountId);
        if (accessTokenIndex != -1) {
            global.accessTokens.splice(accessTokenIndex, 1);
        }
    }

    const xmppClient = global.Clients && Array.isArray(global.Clients) && global.Clients.find(client => client.accountId == user.accountId);
    if (xmppClient && xmppClient.client && typeof xmppClient.client.close === "function") {
        xmppClient.client.close();
    }

    if (typeof functions.UpdateTokens === "function") {
        functions.UpdateTokens();
    }

    return res.json({
        success: true,
        accountId: user.accountId,
        username: safeDisplayName,
        displayName: safeDisplayName,
        email: user.email
    });
});

app.post("/account/api/oauth/token", async (req, res) => {
    if (global.maintenanceMode === true || config.bMaintenance === true) {
        return error.createError(
            "errors.com.epicgames.common.service_unavailable",
            "The backend is currently under maintenance. Please try again later.",
            [],
            -1,
            undefined,
            503,
            res
        );
    }

    const memory = functions.GetVersionInfo(req);

    let clientId;

    try {
        clientId = functions.DecodeBase64(req.headers["authorization"].split(" ")[1]).split(":");

        if (!clientId[1]) throw new Error("invalid client id");

        clientId = clientId[0];
    } catch {
        log.debug("Invalid client ID in authorization header");
        return error.createError(
            "errors.com.epicgames.common.oauth.invalid_client",
            "It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.", 
            [], 1011, "invalid_client", 400, res
        );
    }

    log.debug(`POST /account/api/oauth/token called with grant_type: ${req.body.grant_type}`);

    switch (req.body.grant_type) {
        case "client_credentials":
            let ip = req.ip;

            let clientToken = -1;
            if (Array.isArray(global.clientTokens)) {
                clientToken = global.clientTokens.findIndex(i => i.ip == ip);
                if (clientToken != -1) global.clientTokens.splice(clientToken, 1);
            }

            const token = tokenCreation.createClient(clientId, req.body.grant_type, ip, 4); // expires in 4 hours

            functions.UpdateTokens();

            const decodedClient = jwt.decode(token);

            res.json({
                access_token: `eg1~${token}`,
                expires_in: Math.round(((DateAddHours(new Date(decodedClient.creation_date), decodedClient.hours_expire).getTime()) - (new Date().getTime())) / 1000),
                expires_at: DateAddHours(new Date(decodedClient.creation_date), decodedClient.hours_expire).toISOString(),
                token_type: "bearer",
                client_id: clientId,
                internal_client: true,
                client_service: "fortnite"
            });
        return;

        case "password":
            if (!req.body.username || !req.body.password) {
                log.debug("Missing username or password in request");
                return error.createError(
                    "errors.com.epicgames.common.oauth.invalid_request",
                    "Username/password is required.", 
                    [], 1013, "invalid_request", 400, res
                );
            }
            const { username: email, password: password } = req.body;
            const regex = /@projectreboot\.dev$/;
            rebootAccount = regex.test(email);
            log.debug(`Reboot account: ${rebootAccount}`);
            if (rebootAccount && config.bEnableRebootUser) {
                const findUser = await User.findOne({ email: email.toLowerCase() });
                if (findUser) {
                    req.user = findUser;
                }
                else {
                    const numberWith8Digits = Math.floor(10000000 + Math.random() * 90000000);
                    const registerUser = await functions.registerUser(numberWith8Digits, `reboot_${email.split("@")[0]}`, email, password, true);
                    req.user = await User.findOne({ email: email.toLowerCase() });
                }
            }
            else {
                req.user = await User.findOne({ email: email.toLowerCase() }).lean();
            }

            let err = () => error.createError(
                "errors.com.epicgames.account.invalid_account_credentials",
                "Your e-mail and/or password are incorrect. Please check them and try again.", 
                [], 18031, "invalid_grant", 400, res
            );

            if (!req.user) {
                log.debug("Invalid username or password");
                return err();
            } else {
                if (!rebootAccount) {
                    if (!(await bcrypt.compare(password, req.user.password)))
                        return err();
                }
            }

            await User.updateOne({ _id: req.user._id }, { $set: { lastLogin: new Date() } });

        break;

        case "refresh_token":
            if (!req.body.refresh_token) {
                log.debug("Missing refresh token in request");
                return error.createError(
                    "errors.com.epicgames.common.oauth.invalid_request",
                    "Refresh token is required.", 
                    [], 1013, "invalid_request", 400, res
                );
            }

            const refresh_token = req.body.refresh_token;
            const refreshTokens = Array.isArray(global.refreshTokens) ? global.refreshTokens : [];
            const refreshToken = refreshTokens.findIndex(i => i.token == refresh_token);
            const object = refreshTokens[refreshToken];

            try {
                if (refreshToken == -1 || !object) throw new Error("Refresh token invalid.");
                let decodedRefreshToken = jwt.decode(refresh_token.replace("eg1~", ""));

                if (!decodedRefreshToken || !decodedRefreshToken.creation_date || !decodedRefreshToken.hours_expire) {
                    throw new Error("Malformed refresh token.");
                }

                if (DateAddHours(new Date(decodedRefreshToken.creation_date), decodedRefreshToken.hours_expire).getTime() <= new Date().getTime()) {
                    throw new Error("Expired refresh token.");
                }
            } catch {
                if (refreshToken != -1 && object) {
                    refreshTokens.splice(refreshToken, 1);
                    global.refreshTokens = refreshTokens;
                    functions.UpdateTokens();
                }

                log.debug("Invalid or expired refresh token");
                error.createError(
                    "errors.com.epicgames.account.auth_token.invalid_refresh_token",
                    `Sorry the refresh token '${refresh_token}' is invalid`, 
                    [refresh_token], 18036, "invalid_grant", 400, res
                );

                return;
            }

            req.user = await User.findOne({ accountId: object.accountId }).lean();
        break;

        case "exchange_code":
            if (!req.body.exchange_code) {
                log.debug("Missing exchange code in request");
                return error.createError(
                    "errors.com.epicgames.common.oauth.invalid_request",
                    "Exchange code is required.", 
                    [], 1013, "invalid_request", 400, res
                );
            }

            const { exchange_code } = req.body;

            let index = global.exchangeCodes.findIndex(i => i.exchange_code == exchange_code);
            let exchange = global.exchangeCodes[index];

            if (index == -1) {
                log.debug("Exchange code not found or invalid");
                return error.createError(
                    "errors.com.epicgames.account.oauth.exchange_code_not_found",
                    "Sorry the exchange code you supplied was not found. It is possible that it was no longer valid", 
                    [], 18057, "invalid_grant", 400, res
                );
            }

            global.exchangeCodes.splice(index, 1);
            
            req.user = await User.findOne({ accountId: exchange.accountId }).lean();
        break;
        
        default:
            log.debug(`Unsupported grant type: ${req.body.grant_type}`);
            error.createError(
                "errors.com.epicgames.common.oauth.unsupported_grant_type",
                `Unsupported grant type: ${req.body.grant_type}`, 
                [], 1016, "unsupported_grant_type", 400, res
            );
        return;
    }

    if (req.user.banned) {
        log.debug("User account is banned");
        return error.createError(
            "errors.com.epicgames.account.account_not_active",
            "You have been permanently banned from Fortnite.", 
            [], -1, undefined, 400, res
        );
    }

    if (config.bEnableOnlyOneVersionJoinable === true) {
        if (memory.build != config.bVersionJoinable) {
            log.debug("Someone is logging in from a blocked version.");
            return error.createError(
                "errors.com.epicgames.version_not_supported",
                "You have attempted to log into OGFN Hosting with a blocked version, please download the correct version in the Discord.", 
                [], -1, undefined, 400, res
            );
        }
    }

    let refreshIndex = -1;
    if (Array.isArray(global.refreshTokens)) {
        refreshIndex = global.refreshTokens.findIndex(i => i.accountId == req.user.accountId);
        if (refreshIndex != -1) global.refreshTokens.splice(refreshIndex, 1);
    }

    let accessIndex = -1;
    if (Array.isArray(global.accessTokens)) {
        accessIndex = global.accessTokens.findIndex(i => i.accountId == req.user.accountId);
        if (accessIndex != -1) {
            global.accessTokens.splice(accessIndex, 1);
        }
    }

    let xmppClient = global.Clients && Array.isArray(global.Clients) && global.Clients.find(i => i.accountId == req.user.accountId);
    if (xmppClient && xmppClient.client && typeof xmppClient.client.close === "function") {
        xmppClient.client.close();
    }

    const deviceId = functions.MakeID().replace(/-/ig, "");
    const accessToken = tokenCreation.createAccess(req.user, clientId, req.body.grant_type, deviceId, 8); // expires in 8 hours
    const refreshToken = tokenCreation.createRefresh(req.user, clientId, req.body.grant_type, deviceId, 24); // expires in 24 hours

    functions.UpdateTokens();

    // auto vbuck
    await checkAndGiveAutoVbucks(req.user);
    await applyLoginGrantSkin(req.user.accountId);

    // Dedicated hosts do not always establish an XMPP session. Treat a
    // successful password login as the host-return signal as well, using the
    // persistent isServer flag so renamed host accounts continue to work.
    if (req.body.grant_type === "password") {
        matchmaker.handleHostLogin(req.user.username, req.user.isServer === true);
    }

    const decodedAccess = jwt.decode(accessToken);
    const decodedRefresh = jwt.decode(refreshToken);

    res.json({
        access_token: `eg1~${accessToken}`,
        expires_in: Math.round(((DateAddHours(new Date(decodedAccess.creation_date), decodedAccess.hours_expire).getTime()) - (new Date().getTime())) / 1000),
        expires_at: DateAddHours(new Date(decodedAccess.creation_date), decodedAccess.hours_expire).toISOString(),
        token_type: "bearer",
        refresh_token: `eg1~${refreshToken}`,
        refresh_expires: Math.round(((DateAddHours(new Date(decodedRefresh.creation_date), decodedRefresh.hours_expire).getTime()) - (new Date().getTime())) / 1000),
        refresh_expires_at: DateAddHours(new Date(decodedRefresh.creation_date), decodedRefresh.hours_expire).toISOString(),
        account_id: req.user.accountId,
        client_id: clientId,
        internal_client: true,
        client_service: "fortnite",
        displayName: req.user.username,
        app: "fortnite",
        in_app_id: req.user.accountId,
        device_id: deviceId
    });
});

app.get("/account/api/oauth/verify", verifyToken, (req, res) => {
    let token = req.headers["authorization"].replace("bearer ", "");
    const decodedToken = jwt.decode(token.replace("eg1~", ""));
    const memory = functions.GetVersionInfo(req);

    log.debug(`GET /account/api/oauth/verify called for account: ${req.user.accountId}`);

    if (config.bEnableOnlyOneVersionJoinable === true) {
        if (memory.build != config.bVersionJoinable) {
            log.debug("Someone is logging in from a blocked version.");
            return error.createError(
                "errors.com.epicgames.version_not_supported",
                "You have attempted to log into OGFN Hosting with a blocked version, please download the correct version in the Discord.", 
                [], -1, undefined, 400, res
            );
        }
    }

    res.json({
        token: token,
        session_id: decodedToken.jti,
        token_type: "bearer",
        client_id: decodedToken.clid,
        internal_client: true,
        client_service: "fortnite",
        account_id: req.user.accountId,
        expires_in: Math.round(((DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime()) - (new Date().getTime())) / 1000),
        expires_at: DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).toISOString(),
        auth_method: decodedToken.am,
        display_name: req.user.username,
        app: "fortnite",
        in_app_id: req.user.accountId,
        device_id: decodedToken.dvid
    });
});

app.get("/account/api/oauth/exchange", verifyToken, (req, res) => {
    log.debug("GET /account/api/oauth/exchange called");
    return res.status(400).json({
        "error": "This endpoint is deprecated, please use the discord bot to generate an exchange code."
    });


    let token = req.headers["authorization"].replace("bearer ", "");
    const exchange_code = functions.MakeID().replace(/-/ig, "");

    const decodedToken = jwt.decode(token.replace("eg1~", ""));

    global.exchangeCodes.push({
        accountId: req.user.accountId,
        exchange_code: exchange_code,
        creatingClientId: decodedToken.clid
    });

    setTimeout(() => {
        let exchangeCode = global.exchangeCodes.findIndex(i => i.exchange_code == exchange_code);

        if (exchangeCode != -1) global.exchangeCodes.splice(exchangeCode, 1);
    }, 300000) // remove exchange code in 5 minutes if unused

    res.json({
        expiresInSeconds: 300,
        code: exchange_code,
        creatingClientId: decodedToken.clid
    });
});

app.delete("/account/api/oauth/sessions/kill", (req, res) => {
    log.debug("DELETE /account/api/oauth/sessions/kill called");
    res.status(204).end();
});

app.delete("/account/api/oauth/sessions/kill/:token", (req, res) => {
    let token = req.params.token;

    log.debug(`DELETE /account/api/oauth/sessions/kill/${token} called`);

    const accessTokens = Array.isArray(global.accessTokens) ? global.accessTokens : [];
    const refreshTokens = Array.isArray(global.refreshTokens) ? global.refreshTokens : [];
    const clientTokens = Array.isArray(global.clientTokens) ? global.clientTokens : [];
    const clients = Array.isArray(global.Clients) ? global.Clients : [];

    let accessIndex = accessTokens.findIndex(i => i.token == token);

    if (accessIndex != -1) {
        let object = accessTokens[accessIndex];

        accessTokens.splice(accessIndex, 1);
        global.accessTokens = accessTokens;

        let xmppClient = clients.find(i => i.token == object.token);
        if (xmppClient && xmppClient.client && typeof xmppClient.client.close === "function") {
            xmppClient.client.close();
        }

        let refreshIndex = refreshTokens.findIndex(i => i.accountId == object.accountId);
        if (refreshIndex != -1) {
            refreshTokens.splice(refreshIndex, 1);
            global.refreshTokens = refreshTokens;
        }
    }
    
    let clientIndex = clientTokens.findIndex(i => i.token == token);
    if (clientIndex != -1) {
        clientTokens.splice(clientIndex, 1);
        global.clientTokens = clientTokens;
    }

    if (accessIndex != -1 || clientIndex != -1) functions.UpdateTokens();

    res.status(204).end();
});

app.post("/auth/v1/oauth/token", async (req, res) => {
    res.json({
        access_token: functions.MakeID(),
        token_type: "bearer",
        expires_at: "9999-12-31T23:59:59.999Z",
        features: [
            "AntiCheat",
            "Connect",
            "Ecom"
        ],
        organization_id: functions.MakeID(),
        product_id: "prod-fn",
        sandbox_id: "fn",
        deployment_id: functions.MakeID(),
        expires_in: 3599
    });
})

app.post("/epic/oauth/v2/token", async (req, res) => {
    let clientId;

    try {
        clientId = functions.DecodeBase64(req.headers["authorization"].split(" ")[1]).split(":");

        if (!clientId[1]) throw new Error("invalid client id");

        clientId = clientId[0];
    } catch {
        return error.createError(
            "errors.com.epicgames.common.oauth.invalid_client",
            "It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.", 
            [], 1011, "invalid_client", 400, res
        );
    }

    if (!req.body.refresh_token) return error.createError(
        "errors.com.epicgames.common.oauth.invalid_request",
        "Refresh token is required.", 
        [], 1013, "invalid_request", 400, res
    );

    const refresh_token = req.body.refresh_token;
    const refreshTokens = Array.isArray(global.refreshTokens) ? global.refreshTokens : [];

    let refreshToken = refreshTokens.findIndex(i => i.token == refresh_token);
    let object = refreshTokens[refreshToken];

    try {
        if (refreshToken == -1 || !object) throw new Error("Refresh token invalid.");
        let decodedRefreshToken = jwt.decode(refresh_token.replace("eg1~", ""));

        if (!decodedRefreshToken || !decodedRefreshToken.creation_date || !decodedRefreshToken.hours_expire) {
            throw new Error("Malformed refresh token.");
        }

        if (DateAddHours(new Date(decodedRefreshToken.creation_date), decodedRefreshToken.hours_expire).getTime() <= new Date().getTime()) {
            throw new Error("Expired refresh token.");
        }
    } catch {
        if (refreshToken != -1 && object) {
            refreshTokens.splice(refreshToken, 1);
            global.refreshTokens = refreshTokens;
            functions.UpdateTokens();
        }

        error.createError(
            "errors.com.epicgames.account.auth_token.invalid_refresh_token",
            `Sorry the refresh token '${refresh_token}' is invalid`, 
            [refresh_token], 18036, "invalid_grant", 400, res
        );

        return;
    }

    req.user = await User.findOne({ accountId: object.accountId }).lean();

    res.json({
        scope: req.body.scope || "basic_profile friends_list openid presence",
        token_type: "bearer",
        access_token: functions.MakeID(),
        refresh_token: functions.MakeID(),
        id_token: functions.MakeID(),
        expires_in: 7200,
        expires_at: "9999-12-31T23:59:59.999Z",
        refresh_expires_in: 28800,
        refresh_expires_at: "9999-12-31T23:59:59.999Z",
        account_id: req.user.accountId,
        client_id: clientId,
        application_id: functions.MakeID(),
        selected_account_id: req.user.accountId,
        merged_accounts: []
    });
})


async function checkAndGiveAutoVbucks(user) {
    try {
        // Fetch!
        const freshUser = await User.findOne({ accountId: user.accountId });
        if (!freshUser) {
            return;
        }

        const now = new Date();
        const cooldown = 10 * 60 * 60 * 1000; // 10 hours in milliseconds
        const lastClaimTime = freshUser.lastVbucksClaimTime ? new Date(freshUser.lastVbucksClaimTime) : null;

        // Check if user is eligible for vbucks (never claimed or 10 hours have passed)
        if (lastClaimTime && (now.getTime() - lastClaimTime.getTime()) < cooldown) {
            return; // Still on cooldown
        }

        // Get user's profile
        const profileDoc = await Profiles.findOne({ accountId: freshUser.accountId });
        if (!profileDoc) {
            return; // no profile
        }

        // Add 5k vbucks  both core and profile0
        const amount = 50; // change to whatever number u want 5000 is 5k vbucks etc
        const cc = profileDoc.profiles["common_core"];
        const p0 = profileDoc.profiles["profile0"];

        if (!cc.items["Currency:MtxPurchased"] || !p0.items["Currency:MtxPurchased"]) {
            return; // Currency item doesn't exist
        }

        cc.items["Currency:MtxPurchased"].quantity += amount;
        p0.items["Currency:MtxPurchased"].quantity += amount;

        const giftId = uuid.v4();
        cc.items[giftId] = {
            templateId: "GiftBox:GB_MakeGood",
            attributes: {
                fromAccountId: "[AutoReward]",
                lootList: [
                    {
                        itemType: "Currency:MtxGiveaway",
                        itemGuid: "Currency:MtxGiveaway",
                        quantity: amount,
                    },
                ],
                params: {
                    userMessage: "Thank you for playing Drop! Your next gift will be delivered in 10 hours!",
                },
                giftedOn: now.toISOString(),
            },
            quantity: 1,
        };

        // Saves
        cc.rvn += 1;
        cc.commandRevision += 1;
        cc.updated = now.toISOString();

        await Profiles.updateOne(
            { accountId: freshUser.accountId },
            {
                $set: {
                    "profiles.common_core": cc,
                    "profiles.profile0": p0,
                },
            }
        );

        // updates last time claimed
        await User.updateOne(
            { accountId: freshUser.accountId },
            { $set: { lastVbucksClaimTime: now } }
        );

        log.debug(`Auto-vbucks: Gave ${amount} V-Bucks to ${freshUser.username} (${freshUser.accountId})`);
    } catch (error) {
        log.error(`Error giving auto-vbucks to ${user.accountId}: ${error.message}`);
    }
}

function DateAddHours(pdate, number) {
    let date = pdate;
    date.setHours(date.getHours() + number);

    return date;
}

module.exports = app;