const Report = require('../models/ReportModel');

const Error = require('./ErrorController');

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
            Error({
                file: 'ReportController.js',
                method: 'report_user',
                title: err.toString(),
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