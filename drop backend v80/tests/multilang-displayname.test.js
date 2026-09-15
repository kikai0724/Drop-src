const assert = require("assert");
const http = require("http");
const express = require("express");
const bcrypt = require("bcrypt");

const User = require("../model/user.js");
const authRoutes = require("../routes/auth.js");

(async () => {
    const salt = await bcrypt.genSalt(10);
    const existingPasswordHash = await bcrypt.hash("pass123", salt);

    const originalFindOne = User.findOne;

    try {
        User.findOne = async (query) => {
            if (query && query.email === "test@example.com") {
                return {
                    accountId: "acct_123",
                    email: "test@example.com",
                    username: "oldname",
                    username_lower: "oldname",
                    password: existingPasswordHash,
                    updateOne: async (update) => {
                        return { ok: 1, update };
                    }
                };
            }
            return null;
        };

        const app = express();
        app.use(express.json());
        app.use(authRoutes);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

        try {
            const address = server.address();
            
            // Test 1: Japanese display name
            const japaneseResponse = await fetch(`http://127.0.0.1:${address.port}/account/api/public/changeDisplayName`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "pass123",
                    displayName: "日本語ユーザー"
                })
            });

            const japaneseBody = await japaneseResponse.json();
            assert.strictEqual(japaneseResponse.status, 200, `Japanese test failed: ${JSON.stringify(japaneseBody)}`);
            assert.strictEqual(japaneseBody.displayName, "日本語ユーザー");
            
            // Test 2: Mixed language and emoji
            User.findOne = async (query) => {
                if (query && query.email === "test@example.com") {
                    return {
                        accountId: "acct_123",
                        email: "test@example.com",
                        username: "日本語ユーザー",
                        username_lower: "日本語ユーザー",
                        password: existingPasswordHash,
                        updateOne: async (update) => {
                            return { ok: 1, update };
                        }
                    };
                }
                return null;
            };

            const emojiResponse = await fetch(`http://127.0.0.1:${address.port}/account/api/public/changeDisplayName`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "pass123",
                    displayName: "Player🎮🎯"
                })
            });

            const emojiBody = await emojiResponse.json();
            assert.strictEqual(emojiResponse.status, 200, `Emoji test failed: ${JSON.stringify(emojiBody)}`);
            assert.strictEqual(emojiBody.displayName, "Player🎮🎯");
            
        } finally {
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
    } finally {
        User.findOne = originalFindOne;
    }

    console.log("multi-language displayname test passed");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
