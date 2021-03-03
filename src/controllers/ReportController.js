const Report = require('../models/ReportModel');

const Log = require('./LogController');

class ReportController {

    async report_user(req, res) {
        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            const { reason, description } = req.body;
            if(!targetId || !reason) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await Report.create({
                from: loggedId,
                to: targetId,
                reason: reason,
                description: description,
            });

            return res.status(200).json({
                success: true
            });
        } catch(err) {
            Log({
                file: 'ReportController.js',
                method: 'report_user',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
}

module.exports = new ReportController();