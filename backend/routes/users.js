const express = require('express');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createUserSchema = Joi.object({
  firstName: Joi.string().min(2).max(100).required(),
  lastName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('employee', 'manager').required(),
  managerId: Joi.number().integer().optional()
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().min(2).max(100).optional(),
  lastName: Joi.string().min(2).max(100).optional(),
  role: Joi.string().valid('employee', 'manager').optional(),
  managerId: Joi.number().integer().optional(),
  isActive: Joi.boolean().optional()
});

// Admin: Get all users in company
router.get('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE u.company_id = $1';
    let params = [req.user.company_id];
    let paramCount = 1;

    if (role) {
      whereClause += ` AND u.role = $${++paramCount}`;
      params.push(role);
    }

    if (search) {
      whereClause += ` AND (u.first_name ILIKE $${++paramCount} OR u.last_name ILIKE $${++paramCount} OR u.email ILIKE $${++paramCount})`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Managers can only see their team members
    if (req.user.role === 'manager') {
      whereClause += ` AND (u.manager_id = $${++paramCount} OR u.id = $${paramCount})`;
      params.push(req.user.id);
    }

    const query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
             m.first_name as manager_first_name, m.last_name as manager_last_name
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM users u
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: Create new user
router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { firstName, lastName, email, password, role, managerId } = value;

    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate manager if provided
    if (managerId) {
      const manager = await db.query(
        'SELECT id, role FROM users WHERE id = $1 AND company_id = $2',
        [managerId, req.user.company_id]
      );

      if (manager.rows.length === 0) {
        return res.status(400).json({ error: 'Manager not found' });
      }

      if (manager.rows[0].role !== 'manager' && manager.rows[0].role !== 'admin') {
        return res.status(400).json({ error: 'Selected user is not a manager' });
      }
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(`
      INSERT INTO users (company_id, email, password_hash, first_name, last_name, role, manager_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, first_name, last_name, role, created_at
    `, [req.user.company_id, email, passwordHash, firstName, lastName, role, managerId]);

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get single user
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
             m.first_name as manager_first_name, m.last_name as manager_last_name,
             c.name as company_name
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      JOIN companies c ON u.company_id = c.id
      WHERE u.id = $1 AND u.company_id = $2
    `, [id, req.user.company_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check permissions
    if (req.user.role === 'employee' && user.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'manager' && user.manager_id !== req.user.id && user.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(user);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Admin: Update user
router.put('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateUserSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { firstName, lastName, role, managerId, isActive } = value;

    // Check if user exists in same company
    const existingUser = await db.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate manager if provided
    if (managerId) {
      const manager = await db.query(
        'SELECT id, role FROM users WHERE id = $1 AND company_id = $2',
        [managerId, req.user.company_id]
      );

      if (manager.rows.length === 0) {
        return res.status(400).json({ error: 'Manager not found' });
      }

      if (manager.rows[0].role !== 'manager' && manager.rows[0].role !== 'admin') {
        return res.status(400).json({ error: 'Selected user is not a manager' });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (firstName !== undefined) {
      updates.push(`first_name = $${++paramCount}`);
      params.push(firstName);
    }

    if (lastName !== undefined) {
      updates.push(`last_name = $${++paramCount}`);
      params.push(lastName);
    }

    if (role !== undefined) {
      updates.push(`role = $${++paramCount}`);
      params.push(role);
    }

    if (managerId !== undefined) {
      updates.push(`manager_id = $${++paramCount}`);
      params.push(managerId);
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${++paramCount}`);
      params.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING id, email, first_name, last_name, role, is_active
    `;

    const result = await db.query(query, params);

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Admin: Delete user (soft delete)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete self
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists in same company
    const existingUser = await db.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete (deactivate)
    await db.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ message: 'User deactivated successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get managers list (for assignment)
router.get('/managers/list', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, first_name, last_name, email
      FROM users 
      WHERE company_id = $1 
      AND role IN ('manager', 'admin')
      AND is_active = true
      ORDER BY first_name, last_name
    `, [req.user.company_id]);

    res.json(result.rows);

  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ error: 'Failed to fetch managers' });
  }
});

// Get team members (for managers)
router.get('/team/members', authenticateToken, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'admin') {
      // Admins see all users
      query = `
        SELECT u.id, u.first_name, u.last_name, u.email, u.role,
               m.first_name as manager_first_name, m.last_name as manager_last_name
        FROM users u
        LEFT JOIN users m ON u.manager_id = m.id
        WHERE u.company_id = $1 AND u.is_active = true
        ORDER BY u.first_name, u.last_name
      `;
      params = [req.user.company_id];
    } else {
      // Managers see their team
      query = `
        SELECT u.id, u.first_name, u.last_name, u.email, u.role
        FROM users u
        WHERE u.manager_id = $1 AND u.is_active = true
        ORDER BY u.first_name, u.last_name
      `;
      params = [req.user.id];
    }

    const result = await db.query(query, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current password hash
    const user = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;