const jwt = require("jsonwebtoken");

const User = require("../model/user.js");
const functions = require("../structs/functions.js");
const error = require("../structs/error.js");

function normalizeTokenValue(value) {
    return typeof value === "string" ? value.replace(/^eg1~/i, "") : "";
}

function hasMatchingToken(tokenList, incomingToken) {
    const normalizedIncoming = normalizeTokenValue(incomingToken);
    const fullIncoming = `eg1~${normalizedIncoming}`;

    return tokenList.some((entry) => {
        const candidate = entry && entry.token ? entry.token : "";
        return candidate === fullIncoming || normalizeTokenValue(candidate) === normalizedIncoming;
    });
}

function findMatchingTokenIndex(tokenList, incomingToken) {
    const normalizedIncoming = normalizeTokenValue(incomingToken);
    const fullIncoming = `eg1~${normalizedIncoming}`;

    return tokenList.findIndex((entry) => {
        const candidate = entry && entry.token ? entry.token : "";
        return candidate === fullIncoming || normalizeTokenValue(candidate) === normalizedIncoming;
    });
}

async function verifyToken(req, res, next) {
    let authErr = () => error.createError(
        "errors.com.epicgames.common.authorization.authorization_failed",
        `Authorization failed for ${req.originalUrl}`, 
        [req.originalUrl], 1032, undefined, 401, res
    );

    const authHeader = req.headers["authorization"];
    if (!authHeader || !/^bearer\s+eg1~/i.test(authHeader)) return authErr();

    const token = authHeader.replace(/^bearer\s+/i, "");

    try {
        const decodedToken = jwt.decode(normalizeTokenValue(token));

        if (!hasMatchingToken(global.accessTokens || [], token)) throw new Error("Invalid token.");

        if (DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime() <= new Date().getTime()) {
            throw new Error("Expired access token.");
        }

        req.user = await User.findOne({ accountId: decodedToken.sub }).lean();

        if (req.user.banned) return error.createError(
            "errors.com.epicgames.account.account_not_active",
            "You have been permanently banned from Fortnite.", 
            [], -1, undefined, 400, res
        );

        next();
    } catch {
        let accessIndex = findMatchingTokenIndex(global.accessTokens || [], token);
        if (accessIndex != -1) {
            global.accessTokens.splice(accessIndex, 1);

            functions.UpdateTokens();
        }
        
        return authErr();
    }
}

async function verifyClient(req, res, next) {
    let authErr = () => error.createError(
        "errors.com.epicgames.common.authorization.authorization_failed",
        `Authorization failed for ${req.originalUrl}`, 
        [req.originalUrl], 1032, undefined, 401, res
    );

    const authHeader = req.headers["authorization"];
    if (!authHeader || !/^bearer\s+eg1~/i.test(authHeader)) return authErr();

    const token = authHeader.replace(/^bearer\s+/i, "");

    try {
        const decodedToken = jwt.decode(normalizeTokenValue(token));

        let findAccess = hasMatchingToken(global.accessTokens || [], token);

        if (!findAccess && !hasMatchingToken(global.clientTokens || [], token)) throw new Error("Invalid token.");

        if (DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime() <= new Date().getTime()) {
            throw new Error("Expired access/client token.");
        }

        if (findAccess) {
            req.user = await User.findOne({ accountId: decodedToken.sub }).lean();

            if (req.user.banned) return error.createError(
                "errors.com.epicgames.account.account_not_active",
                "You have been permanently banned from Fortnite.", 
                [], -1, undefined, 400, res
            );
        }

        next();
    } catch (err) {
        let accessIndex = findMatchingTokenIndex(global.accessTokens || [], token);
        if (accessIndex != -1) global.accessTokens.splice(accessIndex, 1);

        let clientIndex = findMatchingTokenIndex(global.clientTokens || [], token);
        if (clientIndex != -1) global.clientTokens.splice(clientIndex, 1);

        if (accessIndex != -1 || clientIndex != -1) functions.UpdateTokens();
        
        return authErr();
    }
}

function DateAddHours(pdate, number) {
    let date = pdate;
    date.setHours(date.getHours() + number);

    return date;
}

module.exports = {
    verifyToken,
    verifyClient
}