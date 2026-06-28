const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  topic: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  // SHA-256 hash of the owner's secret token. We never store the raw token.
  ownerTokenHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Room', roomSchema);
