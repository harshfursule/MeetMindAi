const express = require('express');
const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

const router = express.Router();

// All meeting routes require authentication
router.use(auth);

/**
 * @route   POST /api/meetings
 * @desc    Create a new meeting
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { title, scheduledAt, maxParticipants, description } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a meeting title.',
      });
    }

    // Create the meeting with the current user as host
    const meeting = await Meeting.create({
      title,
      hostId: req.userId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      maxParticipants: maxParticipants || 50,
      description: description || '',
      participants: [
        {
          userId: req.userId,
          role: 'host',
          joinedAt: new Date(),
        },
      ],
    });

    // Populate host info for the response
    await meeting.populate('hostId', 'name email avatar');
    await meeting.populate('participants.userId', 'name email avatar');

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully.',
      data: { meeting },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join('. '),
      });
    }

    console.error('Create meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating meeting.',
    });
  }
});

/**
 * @route   GET /api/meetings
 * @desc    List all meetings for the authenticated user (hosted or participating in)
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, sort = '-createdAt' } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build query: meetings where user is host OR is a participant
    const query = {
      $or: [
        { hostId: req.userId },
        { 'participants.userId': req.userId },
      ],
    };

    // Optional status filter
    if (status && ['scheduled', 'active', 'ended', 'cancelled'].includes(status)) {
      query.status = status;
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('hostId', 'name email avatar')
        .populate('participants.userId', 'name email avatar'),
      Meeting.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        meetings,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error('List meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching meetings.',
    });
  }
});

/**
 * @route   GET /api/meetings/:id
 * @desc    Get a single meeting by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meeting ID format.',
      });
    }

    const meeting = await Meeting.findById(id)
      .populate('hostId', 'name email avatar')
      .populate('participants.userId', 'name email avatar');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: { meeting },
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching meeting.',
    });
  }
});

/**
 * @route   PUT /api/meetings/:id
 * @desc    Update a meeting (only host or admin can update)
 * @access  Private
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meeting ID format.',
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Only the host or an admin can update
    if (!meeting.isHost(req.userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the meeting host or an admin can update this meeting.',
      });
    }

    // Fields that can be updated
    const allowedUpdates = ['title', 'status', 'scheduledAt', 'maxParticipants', 'description'];
    const updates = {};

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // If status is being set to 'ended', set endedAt
    if (updates.status === 'ended') {
      updates.endedAt = new Date();
    }

    const updatedMeeting = await Meeting.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate('hostId', 'name email avatar')
      .populate('participants.userId', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Meeting updated successfully.',
      data: { meeting: updatedMeeting },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join('. '),
      });
    }

    console.error('Update meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating meeting.',
    });
  }
});

/**
 * @route   DELETE /api/meetings/:id
 * @desc    Delete a meeting (only host or admin)
 * @access  Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meeting ID format.',
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Only the host or an admin can delete
    if (!meeting.isHost(req.userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the meeting host or an admin can delete this meeting.',
      });
    }

    await Meeting.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully.',
    });
  } catch (error) {
    console.error('Delete meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting meeting.',
    });
  }
});

/**
 * @route   POST /api/meetings/:id/join
 * @desc    Join a meeting as a participant
 * @access  Private
 */
router.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body; // Optional: allow specifying role (co-host requires host approval)

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meeting ID format.',
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Check if meeting is joinable
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot join a meeting that has been ${meeting.status}.`,
      });
    }

    // Check if user is already an active participant
    if (meeting.isParticipant(req.userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already a participant in this meeting.',
      });
    }

    // Check max participants limit
    const activeCount = meeting.getActiveParticipantCount();
    if (activeCount >= meeting.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Meeting has reached its maximum participant limit.',
      });
    }

    // Determine participant role
    let participantRole = 'participant';
    if (role === 'co-host' && meeting.isHost(req.userId)) {
      participantRole = 'co-host';
    } else if (meeting.isHost(req.userId)) {
      participantRole = 'host';
    }

    // Add participant
    meeting.participants.push({
      userId: req.userId,
      role: participantRole,
      joinedAt: new Date(),
    });

    // If the meeting is still scheduled, set it to active
    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
    }

    await meeting.save();

    await meeting.populate('hostId', 'name email avatar');
    await meeting.populate('participants.userId', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Successfully joined the meeting.',
      data: { meeting },
    });
  } catch (error) {
    console.error('Join meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while joining meeting.',
    });
  }
});

/**
 * @route   POST /api/meetings/:id/leave
 * @desc    Leave a meeting
 * @access  Private
 */
router.post('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meeting ID format.',
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Find the active participant entry for this user
    const participantIndex = meeting.participants.findIndex(
      (p) => p.userId.toString() === req.userId.toString() && !p.leftAt
    );

    if (participantIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not an active participant in this meeting.',
      });
    }

    // Mark participant as having left
    meeting.participants[participantIndex].leftAt = new Date();

    // If the host leaves, end the meeting
    if (meeting.isHost(req.userId)) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
    }

    await meeting.save();

    await meeting.populate('hostId', 'name email avatar');
    await meeting.populate('participants.userId', 'name email avatar');

    res.status(200).json({
      success: true,
      message: meeting.isHost(req.userId)
        ? 'Host left. Meeting has been ended.'
        : 'Successfully left the meeting.',
      data: { meeting },
    });
  } catch (error) {
    console.error('Leave meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while leaving meeting.',
    });
  }
});

/**
 * @route   GET /api/meetings/:id/messages
 * @desc    Get chat messages for a meeting
 * @access  Private
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    let query = { roomId: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ meetingId: id }, { roomId: id }] };
    }

    const messages = await Message.find(query).sort('createdAt').limit(200);

    const filtered = messages.filter((m) => {
      if (!m.isPrivate) return true;
      return (
        m.senderId.toString() === req.userId.toString() ||
        (m.targetUserId && m.targetUserId.toString() === req.userId.toString())
      );
    });

    res.status(200).json({
      success: true,
      data: { messages: filtered },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching messages.',
    });
  }
});

// Transcript & Summary sub-routes
const transcriptRoutes = require('./transcripts');
const summaryRoutes = require('./summaries');

router.use('/:id/transcript', transcriptRoutes);
router.use('/:id', summaryRoutes);

module.exports = router;
