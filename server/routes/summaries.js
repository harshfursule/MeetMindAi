const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Meeting = require('../models/Meeting');
const Transcript = require('../models/Transcript');
const Summary = require('../models/Summary');
const { generateMeetingSummary } = require('../services/summarizer');
const auth = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

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
 * ==========================================
 * Public Route (No auth needed)
 * ==========================================
 * @route   GET /api/summaries/public/:shareToken
 * @desc    View shared meeting summary and notes
 * @access  Public
 */
router.get('/public/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;

    const summary = await Summary.findOne({ shareToken, isShared: true }).populate(
      'meetingId',
      'title scheduledAt endedAt createdAt hostId'
    );

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Shared meeting summary not found or sharing has been disabled.',
      });
    }

    return res.status(200).json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    console.error('Get shared summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve shared summary.',
      error: error.message,
    });
  }
});

/**
 * ==========================================
 * Protected Routes (Require Authentication)
 * ==========================================
 */

/**
 * @route   POST /api/meetings/:id/summarize
 * @desc    Generate or regenerate AI summary from meeting transcript
 * @access  Private
 */
router.post('/summarize', auth, async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Retrieve transcript
    const transcript = await Transcript.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    const entries = transcript ? transcript.entries : [];

    // Generate summary through AI Service (Gemini/OpenAI/NLP fallback)
    const summaryData = await generateMeetingSummary(entries, meeting.title);

    // Save or update Summary in MongoDB
    let summary = await Summary.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    if (summary) {
      summary.title = meeting.title;
      summary.overview = summaryData.overview;
      summary.keyPoints = summaryData.keyPoints;
      summary.actionItems = summaryData.actionItems;
      summary.topics = summaryData.topics;
      summary.sentiment = summaryData.sentiment;
      summary.generatedBy = summaryData.generatedBy;
      if (!summary.shareToken) summary.shareToken = uuidv4();
    } else {
      summary = new Summary({
        meetingId: meeting._id,
        roomId: meeting.roomId,
        title: meeting.title,
        overview: summaryData.overview,
        keyPoints: summaryData.keyPoints,
        actionItems: summaryData.actionItems,
        topics: summaryData.topics,
        sentiment: summaryData.sentiment,
        generatedBy: summaryData.generatedBy,
        shareToken: uuidv4(),
        isShared: false,
      });
    }

    await summary.save();

    return res.status(200).json({
      success: true,
      message: 'AI Meeting Summary generated successfully.',
      data: { summary },
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meeting summary.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/meetings/:id/summary
 * @desc    Get AI meeting summary, key points, and action items
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    let summary = await Summary.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    // If summary doesn't exist yet, check if transcript exists and generate automatically
    if (!summary) {
      const transcript = await Transcript.findOne({
        $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
      });

      if (transcript && transcript.entries.length > 0) {
        const summaryData = await generateMeetingSummary(transcript.entries, meeting.title);
        summary = await Summary.create({
          meetingId: meeting._id,
          roomId: meeting.roomId,
          title: meeting.title,
          overview: summaryData.overview,
          keyPoints: summaryData.keyPoints,
          actionItems: summaryData.actionItems,
          topics: summaryData.topics,
          sentiment: summaryData.sentiment,
          generatedBy: summaryData.generatedBy,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: { summary: summary || null },
    });
  } catch (error) {
    console.error('Fetch summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve meeting summary.',
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/meetings/:id/summary
 * @desc    Update summary details, action item status, or notes
 * @access  Private
 */
router.put('/summary', auth, async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    const { overview, keyPoints, actionItems, topics, sentiment } = req.body;

    let summary = await Summary.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found. Please generate a summary first.',
      });
    }

    if (overview !== undefined) summary.overview = overview;
    if (Array.isArray(keyPoints)) summary.keyPoints = keyPoints;
    if (Array.isArray(actionItems)) summary.actionItems = actionItems;
    if (Array.isArray(topics)) summary.topics = topics;
    if (sentiment !== undefined) summary.sentiment = sentiment;

    await summary.save();

    return res.status(200).json({
      success: true,
      message: 'Summary updated successfully.',
      data: { summary },
    });
  } catch (error) {
    console.error('Update summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meeting summary.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/meetings/:id/summary/share
 * @desc    Toggle share status or generate share link
 * @access  Private
 */
router.post('/summary/share', auth, async (req, res) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    const { isShared } = req.body;

    let summary = await Summary.findOne({
      $or: [{ meetingId: meeting._id }, { roomId: meeting.roomId }],
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found. Please generate a summary first.',
      });
    }

    if (isShared !== undefined) {
      summary.isShared = Boolean(isShared);
    } else {
      summary.isShared = !summary.isShared;
    }

    if (!summary.shareToken) {
      summary.shareToken = uuidv4();
    }

    await summary.save();

    return res.status(200).json({
      success: true,
      message: summary.isShared ? 'Summary is now publicly shared.' : 'Summary sharing is now disabled.',
      data: {
        isShared: summary.isShared,
        shareToken: summary.shareToken,
        shareUrl: `/shared-summary/${summary.shareToken}`,
      },
    });
  } catch (error) {
    console.error('Share summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure summary sharing.',
      error: error.message,
    });
  }
});

module.exports = router;
