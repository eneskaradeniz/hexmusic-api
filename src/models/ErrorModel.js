const mongoose = require('mongoose');

const ErrorSchema = new mongoose.Schema({
    file: String,
    method: String,
    info: mongoose.Schema.Types.Mixed,
    type: String,
    createdAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Error', ErrorSchema);