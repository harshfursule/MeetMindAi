const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ParticipantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['host', 'co-host', 'participant'],
      default: 'participant',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const MeetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a meeting title'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A meeting must have a host'],
    },
    roomId: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    participants: {
      type: [ParticipantSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'ended', 'cancelled'],
      default: 'scheduled',
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    maxParticipants: {
      type: Number,
      default: 50,
      min: [2, 'A meeting must allow at least 2 participants'],
      max: [500, 'A meeting cannot have more than 500 participants'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Index for efficient querying
MeetingSchema.index({ hostId: 1, status: 1 });
MeetingSchema.index({ 'participants.userId': 1 });
MeetingSchema.index({ scheduledAt: 1 });

/**
 * Check if a user is a participant in this meeting.
 * @param {string} userId - The user ID to check
 * @returns {boolean}
 */
MeetingSchema.methods.isParticipant = function (userId) {
  return this.participants.some(
    (p) => p.userId.toString() === userId.toString() && !p.leftAt
  );
};

/**
 * Check if a user is the host of this meeting.
 * @param {string} userId - The user ID to check
 * @returns {boolean}
 */
MeetingSchema.methods.isHost = function (userId) {
  return this.hostId.toString() === userId.toString();
};

/**
 * Get the count of currently active participants (those who haven't left).
 * @returns {number}
 */
MeetingSchema.methods.getActiveParticipantCount = function () {
  return this.participants.filter((p) => !p.leftAt).length;
};

/**
 * Return a clean JSON representation.
 */
MeetingSchema.methods.toJSON = function () {
  const meeting = this.toObject();
  delete meeting.__v;
  return meeting;
};

module.exports = mongoose.model('Meeting', MeetingSchema);
