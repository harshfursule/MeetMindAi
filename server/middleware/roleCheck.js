/**
 * Role-Based Access Control Middleware.
 *
 * Creates a middleware that checks if the authenticated user has one of
 * the allowed roles. Must be used AFTER the auth middleware.
 *
 * @param  {...string} allowedRoles - The roles permitted to access the route
 * @returns {Function} Express middleware function
 *
 * @example
 * // Only admins and hosts can access this route
 * router.get('/admin', auth, roleCheck('admin', 'host'), handler);
 */
const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    // Ensure auth middleware has run and attached user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before role check.',
      });
    }

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

module.exports = roleCheck;
