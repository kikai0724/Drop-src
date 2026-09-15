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
    const originalUpdateOne = User.updateOne;

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

        User.updateOne = async (filter, update) => {
            return { ok: 1, filter, update };
        };

        const app = express();
        app.use(express.json());
        app.use(authRoutes);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

        try {
            const address = server.address();
            const response = await fetch(`http://127.0.0.1:${address.port}/account/api/public/changeDisplayName`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "Test@Example.com",
                    password: "pass123",
                    displayName: "newname"
                })
            });

            const body = await response.json();
            assert.strictEqual(response.status, 200, JSON.stringify(body));
            assert.strictEqual(body.username, "newname");
            assert.strictEqual(body.displayName, "newname");
        } finally {
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
    } finally {
        User.findOne = originalFindOne;
        User.updateOne = originalUpdateOne;
    }

    console.log("displayname change test passed");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
