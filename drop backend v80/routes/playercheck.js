const express = require("express");
const app = express.Router();
const User = require("../model/user.js");
const log = require("../structs/log.js");

app.get("/drop/playercheck/:accountId", async (req, res) => {
    const accountId = String(req.params.accountId || "").trim();

    if (!accountId) {
        return res.json({ banned: false });
    }

    try {
        const user = await User.findOne({ accountId }).select("banned").lean();
        return res.json({ banned: Boolean(user?.banned) });
    } catch (error) {
        log.error(`Player ban check failed for ${accountId}:`, error.message || error);
        return res.status(500).json({ banned: false });
    }
});

module.exports = app;
