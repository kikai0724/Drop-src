const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express.Router();
const Profile = require("../model/profiles.js");
const Friends = require("../model/friends.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const manualCatalogPath = path.join(__dirname, "..", "Config", "manual_catalog_config.json");

app.get("/fortnite/api/storefront/v2/catalog", (req, res) => {
    log.debug("Request to /fortnite/api/storefront/v2/catalog");
    if (req.headers["user-agent"] == undefined) return;
    if (req.headers["user-agent"].includes("2870186")) {
        return res.status(404).end();
    }
    
    res.json(functions.getItemShop());
});

app.post("/shop", verifyToken, async (req, res) => {
    const payload = Object.keys(req.body).length ? req.body : req.query;
    const type = payload.type;
    const id = payload.ID || payload.id || payload.itemId;
    const price = payload.Price || payload.price;
    const time = payload.time;

    const canonicalTypes = {
        Skins: "AthenaCharacter",
        AthenaCharacter: "AthenaCharacter",
        Backblings: "AthenaBackpack",
        AthenaBackPack: "AthenaBackpack",
        AthenaBackpack: "AthenaBackpack",
        Pickaxe: "AthenaPickaxe",
        AthenaPickaxe: "AthenaPickaxe",
        Gliders: "AthenaGlider",
        AthenaGlider: "AthenaGlider",
        Contrails: "AthenaSkyDiveContrail",
        AthenaSkyDiveContrail: "AthenaSkyDiveContrail",
        Emotes: "AthenaDance",
        AthenaDance: "AthenaDance",
        "Loading Screens": "AthenaLoadingScreen",
        AthenaLoadingScreen: "AthenaLoadingScreen",
        MusicPack: "AthenaMusicPack",
        AthenaMusicPack: "AthenaMusicPack"
    };

    const selectedType = canonicalTypes[type];
    if (!selectedType) return error.createError(
        "errors.com.epicgames.request.invalid",
        `Invalid shop type: ${type}`,
        [type], 400, undefined, 400, res
    );
    if (!id || typeof id !== "string") return error.createError(
        "errors.com.epicgames.request.invalid",
        "Missing or invalid ID parameter.",
        ["ID"], 400, undefined, 400, res
    );
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) return error.createError(
        "errors.com.epicgames.request.invalid",
        "Missing or invalid Price parameter.",
        ["Price"], 400, undefined, 400, res
    );
    if (!time || (time !== "now" && time !== "always" && time !== "今すぐ" && time !== "asap" && time !== "normal")) {
        return error.createError(
            "errors.com.epicgames.request.invalid",
            "Missing or invalid time parameter. Use 'now' or 'normal'.",
            ["time"], 400, undefined, 400, res
        );
    }

    let manualCatalog = {};
    if (fs.existsSync(manualCatalogPath)) {
        try {
            manualCatalog = JSON.parse(fs.readFileSync(manualCatalogPath, "utf-8"));
        } catch (error) {
            manualCatalog = {};
        }
    }

    const entryKey = `manual_${selectedType}_${id.replace(/[^a-zA-Z0-9_]/g, "_")}_${Date.now()}`;
    manualCatalog[entryKey] = {
        itemGrants: [`${selectedType}:${id}`],
        price: numericPrice,
        time: time
    };

    fs.writeFileSync(manualCatalogPath, JSON.stringify(manualCatalog, null, 2), "utf-8");

    return res.json({
        success: true,
        message: time === "now" || time === "今すぐ" ? "Shop updated immediately." : "Shop update saved for normal rotation.",
        entry: {
            key: entryKey,
            type: selectedType,
            templateId: `${selectedType}:${id}`,
            price: numericPrice,
            time: time
        }
    });
});

app.get("/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId", verifyToken, async (req, res) => {
    log.debug(`Request to /fortnite/api/storefront/v2/gift/check_eligibility/recipient/${req.params.recipientId}/offer/${req.params.offerId}`);
    const findOfferId = functions.getOfferID(req.params.offerId);
    if (!findOfferId) return error.createError(
        "errors.com.epicgames.fortnite.id_invalid",
        `Offer ID (id: "${req.params.offerId}") not found`,
        [req.params.offerId], 16027, undefined, 400, res
    );

    let sender = await Friends.findOne({ accountId: req.user.accountId }).lean();

    if (!sender.list.accepted.find(i => i.accountId == req.params.recipientId) && req.params.recipientId != req.user.accountId) return error.createError(
        "errors.com.epicgames.friends.no_relationship",
        `User ${req.user.accountId} is not friends with ${req.params.recipientId}`,
        [req.user.accountId, req.params.recipientId], 28004, undefined, 403, res
    );

    const profiles = await Profile.findOne({ accountId: req.params.recipientId });

    let athena = profiles.profiles["athena"];

    for (let itemGrant of findOfferId.offerId.itemGrants) {
        for (let itemId in athena.items) {
            if (itemGrant.templateId.toLowerCase() == athena.items[itemId].templateId.toLowerCase()) return error.createError(
                "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
                `Could not purchase catalog offer ${findOfferId.offerId.devName}, item ${itemGrant.templateId}`,
                [findOfferId.offerId.devName, itemGrant.templateId], 28004, undefined, 403, res
            );
        }
    }

    res.json({
        price: findOfferId.offerId.prices[0],
        items: findOfferId.offerId.itemGrants
    });
});

app.get("/fortnite/api/storefront/v2/keychain", (req, res) => {
    log.debug("Request to /fortnite/api/storefront/v2/keychain");
    res.json(functions.getKeychain());
});

app.get("/catalog/api/shared/bulk/offers", (req, res) => {
    log.debug("Request to /catalog/api/shared/bulk/offers");
    res.json({});
});

module.exports = app;