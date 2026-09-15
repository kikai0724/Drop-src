const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const mongoose = require("mongoose");

// Tournament schema
const TournamentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    maxParticipants: { type: Number, default: 100 },
    currentParticipants: { type: Number, default: 0 },
    status: { type: String, default: "upcoming" }, // upcoming, active, completed, cancelled
    prizePool: { type: Number, default: 0 },
    bracketType: { type: String, default: "single_elimination" },
    entries: [{
        accountId: { type: String },
        username: { type: String },
        registeredAt: { type: Date },
        stats: {
            eliminations: { type: Number, default: 0 },
            placement: { type: Number }
        }
    }],
    winner: { accountId: String, username: String }
}, { collection: "tournaments" });

const Tournaments = mongoose.models.Tournaments || mongoose.model('Tournaments', TournamentSchema);

// Get active tournaments
app.get("/fortnite/api/tournaments/active", verifyToken, async (req, res) => {
    log.debug("GET /fortnite/api/tournaments/active");
    
    try {
        const now = new Date();
        
        const activeTournaments = await Tournaments.find({
            $or: [
                { status: "upcoming", startDate: { $lte: now } },
                { status: "active" }
            ]
        })
        .sort({ startDate: -1 })
        .limit(20)
        .lean();
        
        res.json({ tournaments: activeTournaments });
    } catch (err) {
        log.error(`Error fetching tournaments: ${err.message}`);
        res.json({ tournaments: [] });
    }
});

// Register for tournament
app.post("/fortnite/api/tournaments/:tournamentId/register", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/tournaments/${req.params.tournamentId}/register`);
    
    try {
        const tournament = await Tournaments.findById(req.params.tournamentId);
        
        if (!tournament) {
            return error.createError(
                "errors.com.epicgames.tournaments.not_found",
                "Tournament not found",
                [req.params.tournamentId], 17000, undefined, 404, res
            );
        }
        
        const now = new Date();
        
        // Check if tournament is accepting registrations
        if (tournament.status !== "upcoming" || now > tournament.startDate) {
            return error.createError(
                "errors.com.epicgames.tournaments.registration_closed",
                "Registration is closed for this tournament",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Check if already registered
        const alreadyRegistered = tournament.entries.some(
            entry => entry.accountId === req.user.accountId
        );
        
        if (alreadyRegistered) {
            return error.createError(
                "errors.com.epicgames.tournaments.already_registered",
                "You are already registered for this tournament",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Check if tournament is full
        if (tournament.currentParticipants >= tournament.maxParticipants) {
            return error.createError(
                "errors.com.epicgames.tournaments.full",
                "Tournament is full",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Register player
        tournament.entries.push({
            accountId: req.user.accountId,
            username: req.user.username,
            registeredAt: now,
            stats: { eliminations: 0, placement: null }
        });
        
        tournament.currentParticipants += 1;
        await tournament.save();
        
        res.json({
            success: true,
            message: "Successfully registered for tournament",
            position: tournament.currentParticipants
        });
    } catch (err) {
        log.error(`Error registering for tournament: ${err.message}`);
        error.createError(
            "errors.com.epicgames.tournaments.registration_failed",
            "Failed to register for tournament",
            undefined, 12820, undefined, 500, res
        );
    }
});

// Get tournament bracket
app.get("/fortnite/api/tournaments/:tournamentId/bracket", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/tournaments/${req.params.tournamentId}/bracket`);
    
    try {
        const tournament = await Tournaments.findById(req.params.tournamentId).lean();
        
        if (!tournament) {
            return error.createError(
                "errors.com.epicgames.tournaments.not_found",
                "Tournament not found",
                [req.params.tournamentId], 17000, undefined, 404, res
            );
        }
        
        // Generate bracket structure based on entries
        const generateBracket = (entries) => {
            if (tournament.bracketType === "single_elimination") {
                return generateSingleEliminationBracket(entries);
            } else if (tournament.bracketType === "double_elimination") {
                return generateDoubleEliminationBracket(entries);
            } else if (tournament.bracketType === "round_robin") {
                return generateRoundRobinBracket(entries);
            }
            return {};
        };
        
        const bracket = generateBracket(tournament.entries);
        
        res.json({
            tournament: {
                name: tournament.name,
                status: tournament.status,
                prizePool: tournament.prizePool
            },
            bracket
        });
    } catch (err) {
        log.error(`Error fetching bracket: ${err.message}`);
        res.json({ tournament: null, bracket: {} });
    }
});

// Submit tournament result
app.post("/fortnite/api/tournaments/:tournamentId/submit-result", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/tournaments/${req.params.tournamentId}/submit-result`);
    
    try {
        const { eliminations, placement } = req.body;
        
        const tournament = await Tournaments.findById(req.params.tournamentId);
        
        if (!tournament) {
            return error.createError(
                "errors.com.epicgames.tournaments.not_found",
                "Tournament not found",
                [req.params.tournamentId], 17000, undefined, 404, res
            );
        }
        
        if (tournament.status !== "active") {
            return error.createError(
                "errors.com.epicgames.tournaments.not_active",
                "Tournament is not active",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Update player stats
        const entry = tournament.entries.find(e => e.accountId === req.user.accountId);
        
        if (!entry) {
            return error.createError(
                "errors.com.epicgames.tournaments.not_registered",
                "You are not registered for this tournament",
                undefined, 1040, undefined, 400, res
            );
        }
        
        entry.stats.eliminations += eliminations || 0;
        if (placement) {
            entry.stats.placement = placement;
        }
        
        await tournament.save();

        // Add tournament persistent points (ReloadPoints) for the player
        try {
            await functions.addTournamentPoints(req.user.accountId, eliminations || 0, placement ? Number(placement) : undefined);
        } catch (err) {
            log.error(`Error adding tournament points: ${err.message}`);
        }
        
        res.json({ success: true, stats: entry.stats });
    } catch (err) {
        log.error(`Error submitting result: ${err.message}`);
        error.createError(
            "errors.com.epicgames.tournaments.submit_failed",
            "Failed to submit result",
            undefined, 12821, undefined, 500, res
        );
    }
});

// Helper functions for bracket generation
function generateSingleEliminationBracket(entries) {
    // Simple single elimination bracket
    const rounds = Math.ceil(Math.log2(entries.length));
    const bracket = {};
    
    for (let i = 0; i < rounds; i++) {
        bracket[`round${i + 1}`] = [];
    }
    
    return bracket;
}

function generateDoubleEliminationBracket(entries) {
    return {};
}

function generateRoundRobinBracket(entries) {
    return {};
}

module.exports = app;

