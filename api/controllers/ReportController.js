const Report = require('../models/ReportModel');

const Error = require('./ErrorController');

class ReportController {

    async report_user(req, res) {
        try {
            const logged_id = req._id;
            const target_id = req.params.user_id;
            const { reason, description } = req.body;
            if(!target_id || !reason) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await Report.create({
                from: logged_id,
                to: target_id,
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

    async report_group(req, res) {
        
    }
}

module.exports = new ReportController();