const mongoose = require('mongoose');

const ParticipantSchema = mongoose.Schema({
    chat_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Chat',
        required: true,
        index: true
    },
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true,
        index: true
    },

    read: {
        type: Boolean,
        default: false
    },

    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Participant', ParticipantSchema);