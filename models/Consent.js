const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema({
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  termsVersion: {
    type: Number,
    default: 1
  },
  acceptedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Consent', consentSchema);
