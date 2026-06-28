const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['text', 'voice'],
    required: true
  },
  handle: {
    type: String,
    required: true
  },
  // Used when type === 'text'
  content: {
    type: String,
    maxlength: 2000
  },
  // Used when type === 'voice'
  audioData: {
    type: Buffer
  },
  mimeType: {
    type: String
  },
  duration: {
    type: Number // seconds
  },
  // Captured server-side for moderation only — never returned by the public
  // message-history endpoint, only by the admin-only lookup route.
  ipAddress: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Message', messageSchema);
