const mongoose = require('mongoose');

const ErrorSchema = new mongoose.Schema({
    file: String,
    method: String,
    title: String,
    info: mongoose.Schema.Types.Mixed,
    type: String,
    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Error', ErrorSchema);