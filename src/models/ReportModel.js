const mongoose = require('mongoose');

const ReportSchema = mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true,
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true,
    },

    reason: {
        type: String,
        enum: ['swearing','harassment','racist','other'],
        required: true,
    },
    description: {
        type: String
    },
    
    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Report', ReportSchema);