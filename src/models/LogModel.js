const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    file: String,
    method: String,
    info: String,
    type: String,
    createdAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Log', LogSchema);