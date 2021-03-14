const mongoose = require('mongoose');

const DislikeSchema = mongoose.Schema({
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
    
    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Dislike', DislikeSchema);