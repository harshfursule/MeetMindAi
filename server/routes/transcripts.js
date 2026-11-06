const express = require('express');
const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const Transcript = require('../models/Transcript');
const auth = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// Protect all transcript routes with authentication
router.use(auth);

/**
 * Helper to find meeting by ObjectId or roomId
 */
async function findMeeting(idOrRoomId) {
  if (mongoose.Types.ObjectId.isValid(idOrRoomId)) {
    const byId = await Meeting.findById(idOrRoomId);
    if (byId) return byId;
  }
  return Meeting.findOne({ roomId: idOrRoomId });
}

/**
 * @route   GET /api/meetings/:id/transcript
 * @desc    Get complete meeting transcript with speaker labels and timestamps
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    let transcript = await Transcript.findOne({ meetingId: meeting._id });

    if (!transcript) {
      // Check by roomId as secondary lookup
      transcript = await Transcript.findOne({ roomId: meeting.roomId });
    }

    return res.status(200).json({
      success: true,
      data: {
        meetingId: meeting._id,
        roomId: meeting.roomId,
        entries: transcript ? transcript.entries : [],
        totalEntries: transcript ? transcript.entries.length : 0,
      },
    });
  } catch (error) {
    console.error('Fetch transcript error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transcript.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/meetings/:id/transcript
 * @desc    Append one or more speaker-labelled entries to the meeting transcript
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    const { speakerName, text, timestamp, confidence, isFinal, entries } = req.body;

    // Find or create transcript document
    let transcript = await Transcript.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    if (!transcript) {
      transcript = new Transcript({
        meetingId: meeting._id,
        roomId: meeting.roomId,
        entries: [],
      });
    }

    if (Array.isArray(entries) && entries.length > 0) {
      // Batch append
      entries.forEach((item) => {
        if (item.text && item.text.trim()) {
          transcript.entries.push({
            speakerId: item.speakerId || req.userId,
            speakerName: item.speakerName || req.userName || 'Participant',
            text: item.text.trim(),
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
            confidence: item.confidence !== undefined ? item.confidence : 1.0,
            isFinal: item.isFinal !== false,
          });
        }
      });
    } else if (text && text.trim()) {
      // Single entry append
      transcript.entries.push({
        speakerId: req.userId,
        speakerName: speakerName || req.userName || 'Participant',
        text: text.trim(),
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        confidence: confidence !== undefined ? confidence : 1.0,
        isFinal: isFinal !== false,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid text or entries to append.',
      });
    }

    await transcript.save();

    return res.status(200).json({
      success: true,
      message: 'Transcript updated successfully.',
      data: {
        totalEntries: transcript.entries.length,
        latestEntry: transcript.entries[transcript.entries.length - 1],
      },
    });
  } catch (error) {
    console.error('Append transcript error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to append transcript.',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/meetings/:id/transcript
 * @desc    Clear meeting transcript (Host only)
 * @access  Private
 */
router.delete('/', async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Check host permission
    if (meeting.hostId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the meeting host can clear the transcript.',
      });
    }

    await Transcript.findOneAndDelete({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    return res.status(200).json({
      success: true,
      message: 'Transcript cleared successfully.',
    });
  } catch (error) {
    console.error('Delete transcript error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear transcript.',
      error: error.message,
    });
  }
});

module.exports = router;
