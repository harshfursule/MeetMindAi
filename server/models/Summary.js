const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ActionItemSchema = new mongoose.Schema(
  {
    task: {
      type: String,
      required: true,
      trim: true,
    },
    assignee: {
      type: String,
      default: 'Unassigned',
      trim: true,
    },
    dueDate: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
  },
  { _id: true }
);

const SummarySchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      unique: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    overview: {
      type: String,
      required: true,
      trim: true,
    },
    keyPoints: {
      type: [String],
      default: [],
    },
    actionItems: {
      type: [ActionItemSchema],
      default: [],
    },
    topics: {
      type: [String],
      default: [],
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative', 'constructive'],
      default: 'constructive',
    },
    generatedBy: {
      type: String,
      default: 'meetmind-nlp-engine',
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      default: () => uuidv4(),
    },
    isShared: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Summary = mongoose.model('Summary', SummarySchema);

module.exports = Summary;
