const mongoose = require('mongoose');

const banSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 300
  },
  bannedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ban', banSchema);
