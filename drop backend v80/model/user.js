const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        created: { type: Date, required: true },
        banned: { type: Boolean, default: false },
        discordId: { type: String, default: null, unique: true, sparse: true },
        accountId: { type: String, required: true, unique: true },
        username: { type: String, required: true, unique: true },
        username_lower: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        avatarUrl: { type: String, default: null },
        matchmakingId: { type: String, required: true, unique: true},
        isServer: { type: Boolean, default: false},
        currentSACCode: { type: String, default: null },
        lastLogin: { type: Date, default: null },
        lastVbucksClaimTime: { type: Date, default: null },
        xp: { type: Number, default: 0 },
        level: { type: Number, default: 1 },
        bookXp: { type: Number, default: 0 },
        bookLevel: { type: Number, default: 1 },
        lastXpUpdate: { type: Date, default: null }
    },
    {
        collection: "users"
    }
)

const model = mongoose.model('UserSchema', UserSchema);

module.exports = model;