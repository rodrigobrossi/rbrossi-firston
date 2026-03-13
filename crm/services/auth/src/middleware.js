'use strict';
const jwt = require('jsonwebtoken');

/**
 * Express middleware — verifies JWT from Authorization header.
 * In prod, this is a Lambda Authorizer on AWS API Gateway.
 * In dev, each service verifies locally (same secret).
 */
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
