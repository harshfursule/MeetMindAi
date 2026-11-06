const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: false, // May be null if using string roomId or ephemeral
    },
    roomId: {
      type: String,
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUserName: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ roomId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
