const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  closed: {
    type: Boolean,
    default: false,
  },
  transcript: {
    type: String,  // Optional: URL or path to transcript
  },
  // Add any other fields specific to your ticket system
}, { timestamps: true });

module.exports = mongoose.model('Ticket', TicketSchema);
