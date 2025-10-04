const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user details from database
    const result = await db.query(
      'SELECT id, email, role, company_id, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

const requireSameCompany = async (req, res, next) => {
  try {
    const { expenseId, userId } = req.params;
    
    if (expenseId) {
      const result = await db.query(
        'SELECT company_id FROM expenses WHERE id = $1',
        [expenseId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      if (result.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    if (userId) {
      const result = await db.query(
        'SELECT company_id FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (result.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireSameCompany
};