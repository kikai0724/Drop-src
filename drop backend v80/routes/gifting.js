const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const User = require("../model/user.js");
const mongoose = require("mongoose");

// Gifts collection schema
const GiftsSchema = new mongoose.Schema({
    senderAccountId: { type: String, required: true },
    recipientAccountId: { type: String, required: true },
    itemGrants: { type: Array, required: true },
    message: { type: String },
    sentAt: { type: Date, default: Date.now },
    claimedAt: { type: Date },
    status: { type: String, default: "pending" } // pending, claimed, expired
}, { collection: "gifts" });

const Gifts = mongoose.models.Gifts || mongoose.model('Gifts', GiftsSchema);

// Send gift to player
app.post("/fortnite/api/gifting/send", verifyToken, async (req, res) => {
    log.debug("POST /fortnite/api/gifting/send");
    
    try {
        const { recipientAccountId, itemGrants, message } = req.body;
        
        if (!recipientAccountId || !itemGrants || itemGrants.length === 0) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Missing required fields",
                ["recipientAccountId", "itemGrants"], 1040, undefined, 400, res
            );
        }
        
        // Check if recipient exists
        const recipient = await User.findOne({ accountId: recipientAccountId, banned: false }).lean();
        
        if (!recipient) {
            return error.createError(
                "errors.com.epicgames.account.account_not_found",
                "Recipient not found",
                [recipientAccountId], 18007, undefined, 404, res
            );
        }
        
        // Prevent self-gifting
        if (recipientAccountId === req.user.accountId) {
            return error.createError(
                "errors.com.epicgames.gifting.cannot_gift_self",
                "You cannot send gifts to yourself",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Deduct vbucks for gift if needed
        const senderProfiles = await Profiles.findOne({ accountId: req.user.accountId });
        
        if (!senderProfiles) {
            return error.createError(
                "errors.com.epicgames.modules.profile.profile_not_found",
                "Profile not found",
                [req.user.accountId], 12806, undefined, 404, res
            );
        }
        
        const gift = new Gifts({
            senderAccountId: req.user.accountId,
            recipientAccountId,
            itemGrants,
            message: message || "",
            status: "pending"
        });
        
        await gift.save();
        
        res.json({ 
            success: true, 
            giftId: gift._id,
            message: "Gift sent successfully"
        });
    } catch (err) {
        log.error(`Error sending gift: ${err.message}`);
        error.createError(
            "errors.com.epicgames.gifting.send_failed",
            "Failed to send gift",
            undefined, 12812, undefined, 500, res
        );
    }
});

// Get received gifts
app.get("/fortnite/api/gifting/received", verifyToken, async (req, res) => {
    log.debug("GET /fortnite/api/gifting/received");
    
    try {
        const gifts = await Gifts.find({ 
            recipientAccountId: req.user.accountId,
            status: "pending"
        })
        .sort({ sentAt: -1 })
        .limit(50)
        .lean();
        
        res.json({ gifts });
    } catch (err) {
        log.error(`Error fetching gifts: ${err.message}`);
        res.json({ gifts: [] });
    }
});

// Claim gift
app.post("/fortnite/api/gifting/:giftId/claim", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/gifting/${req.params.giftId}/claim`);
    
    try {
        const gift = await Gifts.findById(req.params.giftId);
        
        if (!gift) {
            return error.createError(
                "errors.com.epicgames.gifting.gift_not_found",
                "Gift not found",
                [req.params.giftId], 17000, undefined, 404, res
            );
        }
        
        if (gift.recipientAccountId !== req.user.accountId) {
            return error.createError(
                "errors.com.epicgames.gifting.unauthorized",
                "This gift is not for you",
                undefined, 403, undefined, 403, res
            );
        }
        
        if (gift.status !== "pending") {
            return error.createError(
                "errors.com.epicgames.gifting.already_claimed",
                "This gift has already been claimed",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Update recipient's profile with items
        const recipientProfiles = await Profiles.findOne({ accountId: req.user.accountId });
        
        if (!recipientProfiles) {
            return error.createError(
                "errors.com.epicgames.modules.profile.profile_not_found",
                "Profile not found",
                [req.user.accountId], 12806, undefined, 404, res
            );
        }
        
        // Grant items to recipient
        for (const grant of gift.itemGrants) {
            if (grant.templateId && grant.quantity) {
                // Add item to inventory
                const itemId = functions.MakeID();
                recipientProfiles.profiles.athena.items[grant.templateId] = {
                    templateId: grant.templateId,
                    attributes: {
                        item_seen: false
                    }
                };
            }
        }
        
        gift.status = "claimed";
        gift.claimedAt = new Date();
        await gift.save();
        await recipientProfiles.save();
        
        res.json({ 
            success: true, 
            message: "Gift claimed successfully",
            items: gift.itemGrants
        });
    } catch (err) {
        log.error(`Error claiming gift: ${err.message}`);
        error.createError(
            "errors.com.epicgames.gifting.claim_failed",
            "Failed to claim gift",
            undefined, 12813, undefined, 500, res
        );
    }
});

module.exports = app;

