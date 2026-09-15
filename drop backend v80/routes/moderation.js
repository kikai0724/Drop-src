const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const mongoose = require("mongoose");

// Create reports collection schema
const ReportsSchema = new mongoose.Schema({
    reporterAccountId: { type: String, required: true },
    reportedAccountId: { type: String, required: true },
    reason: { type: String, required: true },
    description: { type: String },
    evidence: { type: String },
    reportedAt: { type: Date, default: Date.now },
    status: { type: String, default: "pending" }, // pending, reviewed, action_taken, dismissed
    reviewedBy: { type: String },
    reviewedAt: { type: Date }
}, { collection: "reports" });

const Reports = mongoose.models.Reports || mongoose.model('Reports', ReportsSchema);

// File report on a player
app.post("/fortnite/api/reports/report", verifyToken, async (req, res) => {
    log.debug("POST /fortnite/api/reports/report");
    
    try {
        const { reportedAccountId, reason, description, evidence } = req.body;
        
        if (!reportedAccountId || !reason) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Missing required fields",
                ["reportedAccountId", "reason"], 1040, undefined, 400, res
            );
        }
        
        // Prevent self-reporting
        if (reportedAccountId === req.user.accountId) {
            return error.createError(
                "errors.com.epicgames.reports.cannot_report_self",
                "You cannot report yourself",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Check if user already reported this player recently
        const recentReport = await Reports.findOne({
            reporterAccountId: req.user.accountId,
            reportedAccountId: reportedAccountId,
            reportedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        });
        
        if (recentReport) {
            return error.createError(
                "errors.com.epicgames.reports.too_many_reports",
                "You have already reported this player recently",
                undefined, 1040, undefined, 400, res
            );
        }
        
        const report = new Reports({
            reporterAccountId: req.user.accountId,
            reportedAccountId,
            reason,
            description: description || "",
            evidence: evidence || "",
            status: "pending"
        });
        
        await report.save();
        
        res.json({ success: true, reportId: report._id });
    } catch (err) {
        log.error(`Error filing report: ${err.message}`);
        error.createError(
            "errors.com.epicgames.reports.report_failed",
            "Failed to file report",
            undefined, 12810, undefined, 500, res
        );
    }
});

// Get reports (for moderation team)
app.get("/fortnite/api/moderation/reports", verifyToken, async (req, res) => {
    log.debug("GET /fortnite/api/moderation/reports");
    
    try {
        // Check if user is moderator
        const user = await User.findOne({ accountId: req.user.accountId }).lean();
        // TODO: Add moderator check
        
        const reports = await Reports.find({ status: "pending" })
            .sort({ reportedAt: -1 })
            .limit(50)
            .lean();
        
        res.json({ reports });
    } catch (err) {
        log.error(`Error fetching reports: ${err.message}`);
        res.json({ reports: [] });
    }
});

// Update report status (for moderation team)
app.patch("/fortnite/api/moderation/reports/:reportId", verifyToken, async (req, res) => {
    log.debug(`PATCH /fortnite/api/moderation/reports/${req.params.reportId}`);
    
    try {
        const { status, action } = req.body;
        
        const report = await Reports.findById(req.params.reportId);
        
        if (!report) {
            return error.createError(
                "errors.com.epicgames.reports.report_not_found",
                "Report not found",
                [req.params.reportId], 17000, undefined, 404, res
            );
        }
        
        report.status = status || report.status;
        report.reviewedBy = req.user.accountId;
        report.reviewedAt = new Date();
        
        await report.save();
        
        // Take action if needed
        if (action === "ban" || action === "warn") {
            // TODO: Implement ban/warn logic
        }
        
        res.json({ success: true, report });
    } catch (err) {
        log.error(`Error updating report: ${err.message}`);
        error.createError(
            "errors.com.epicgames.reports.update_failed",
            "Failed to update report",
            undefined, 12811, undefined, 500, res
        );
    }
});

// Chat moderation - filter bad words
app.post("/fortnite/api/chat/filter", verifyToken, async (req, res) => {
    log.debug("POST /fortnite/api/chat/filter");
    
    try {
        const Filter = require('bad-words');
        const filter = new Filter();
        
        const { message } = req.body;
        
        if (!message) {
            return res.json({ 
                filtered: true, 
                filteredMessage: "",
                reason: "Empty message"
            });
        }
        
        const isProfane = filter.isProfane(message);
        const filteredMessage = filter.clean(message);
        
        res.json({
            filtered: isProfane,
            originalMessage: message,
            filteredMessage: filteredMessage,
            reason: isProfane ? "Contains profanity" : "Clean"
        });
    } catch (err) {
        log.error(`Error filtering chat: ${err.message}`);
        res.json({ filtered: false });
    }
});

module.exports = app;

