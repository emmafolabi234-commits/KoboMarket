// src/middlewares/rbac.js
/**
 * Role‑Based Access Control middleware.
 * Usage: `app.use('/api/v1/vendors', authenticate, rbac(['ADMIN']))`
 */
module.exports = function(requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const userRoles = req.user.roles || [];
    const hasRole = requiredRoles.some(r => userRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }
    next();
  };
};
