const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * Generate or retrieve ICE servers (STUN + TURN) configuration.
 * Configured for maximum traversability on restrictive corporate firewalls and symmetric NATs:
 * - STUN (UDP discovery)
 * - TURN over UDP (low latency relay)
 * - TURN over TCP (firewall traversal)
 * - TURNS over TLS on port 443 (encrypted relay that passes through deep packet inspection firewalls)
 *
 * @param {string} userId - User identifier for time-limited credentials
 * @returns {Array<Object>} List of RTCIceServer objects
 */
const getIceServers = (userId = 'guest') => {
  const stunUrls = (
    process.env.STUN_SERVERS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const iceServers = [
    {
      urls: stunUrls,
    },
  ];

  const turnUrls = (
    process.env.TURN_SERVER_URLS ||
    'turn:openrelay.metered.ca:80,turn:openrelay.metered.ca:443,turn:openrelay.metered.ca:443?transport=tcp,turns:openrelay.metered.ca:443?transport=tcp'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const turnSecret = process.env.TURN_SECRET;
  const staticUsername = process.env.TURN_USERNAME || 'openrelayproject';
  const staticCredential = process.env.TURN_CREDENTIAL || 'openrelayproject';

  if (turnUrls.length > 0) {
    if (turnSecret) {
      // Ephemeral / time-limited credentials (standard Coturn use-auth-secret format)
      // Expiration timestamp in seconds (valid for 24 hours)
      const expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
      const username = `${expiry}:${userId}`;
      const credential = crypto
        .createHmac('sha1', turnSecret)
        .update(username)
        .digest('base64');

      iceServers.push({
        urls: turnUrls,
        username,
        credential,
      });
    } else {
      // Static credentials (e.g., OpenRelay, Metered, or Coturn static user)
      iceServers.push({
        urls: turnUrls,
        username: staticUsername,
        credential: staticCredential,
      });
    }
  }

  return iceServers;
};

/**
 * @route   GET /api/webrtc/ice-servers
 * @desc    Get STUN and TURN server configuration for NAT traversal
 * @access  Private
 */
router.get('/ice-servers', auth, (req, res) => {
  try {
    const iceServers = getIceServers(req.userId);
    const hasTurn = iceServers.some((s) =>
      Array.isArray(s.urls)
        ? s.urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'))
        : typeof s.urls === 'string' &&
          (s.urls.startsWith('turn:') || s.urls.startsWith('turns:'))
    );

    res.status(200).json({
      success: true,
      data: {
        iceServers,
        hasTurn,
        count: iceServers.length,
      },
    });
  } catch (error) {
    console.error('[WebRTC Config] Error generating ICE servers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ICE server configuration.',
    });
  }
});

module.exports = { router, getIceServers };
