const mongoose = require('mongoose');

const TranscriptEntrySchema = new mongoose.Schema(
  {
    speakerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    speakerName: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    confidence: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1,
    },
    isFinal: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const TranscriptSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    entries: {
      type: [TranscriptEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Format full transcript into structured string for AI summarization.
 * Formats as:
 * [HH:MM:SS] Speaker Name: Message text
 */
TranscriptSchema.methods.getFormattedText = function () {
  if (!this.entries || this.entries.length === 0) {
    return '';
  }

  return this.entries
    .map((entry) => {
      const timeStr = entry.timestamp
        ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })
        : '00:00:00';
      return `[${timeStr}] ${entry.speakerName}: ${entry.text}`;
    })
    .join('\n');
};

const Transcript = mongoose.model('Transcript', TranscriptSchema);

module.exports = Transcript;
