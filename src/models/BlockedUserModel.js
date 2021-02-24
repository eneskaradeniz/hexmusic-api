const mongoose = require('mongoose');

const BlockedUserSchema = mongoose.Schema({
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
    
    sendAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('BlockedUser', BlockedUserSchema);