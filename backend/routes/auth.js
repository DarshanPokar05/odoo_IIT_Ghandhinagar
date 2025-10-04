const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const signupSchema = Joi.object({
  companyName: Joi.string().min(2).max(255).required(),
  firstName: Joi.string().min(2).max(100).required(),
  lastName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  baseCurrency: Joi.string().length(3).default('USD')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Company signup (creates company + admin user)
router.post('/signup', async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { companyName, firstName, lastName, email, password, baseCurrency } = value;

    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Create company
      const companyResult = await client.query(
        'INSERT INTO companies (name, base_currency) VALUES ($1, $2) RETURNING id',
        [companyName, baseCurrency]
      );
      const companyId = companyResult.rows[0].id;

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create admin user
      const userResult = await client.query(`
        INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5, 'admin')
        RETURNING id, email, first_name, last_name, role, company_id
      `, [companyId, email, passwordHash, firstName, lastName]);

      const user = userResult.rows[0];

      // Create default expense categories for the company
      await client.query(`
        INSERT INTO expense_categories (company_id, name, description) VALUES 
        ($1, 'Food', 'Meals and dining expenses'),
        ($1, 'Travel', 'Transportation and travel costs'),
        ($1, 'Accommodation', 'Hotel and lodging expenses'),
        ($1, 'Office Supplies', 'Office equipment and supplies'),
        ($1, 'Entertainment', 'Client entertainment and events'),
        ($1, 'Training', 'Professional development and training'),
        ($1, 'Other', 'Miscellaneous expenses')
      `, [companyId]);

      // Create default approval rules
      await client.query(`
        INSERT INTO approval_rules (company_id, name, rule_type, min_amount, max_amount, sequence_order)
        VALUES 
        ($1, 'Small Expenses', 'sequential', 0, 100, 1),
        ($1, 'Medium Expenses', 'sequential', 100.01, 1000, 2),
        ($1, 'Large Expenses', 'percentage', 1000.01, NULL, 3)
      `, [companyId]);

      await client.query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.status(201).json({
        message: 'Company and admin user created successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          companyId: user.company_id
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Get user with company info
    const result = await db.query(`
      SELECT u.*, c.name as company_name, c.base_currency 
      FROM users u 
      JOIN companies c ON u.company_id = c.id 
      WHERE u.email = $1 AND u.is_active = true
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name,
        baseCurrency: user.base_currency
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.company_id,
             c.name as company_name, c.base_currency,
             m.first_name as manager_first_name, m.last_name as manager_last_name
      FROM users u 
      JOIN companies c ON u.company_id = c.id 
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name,
      baseCurrency: user.base_currency,
      manager: user.manager_first_name ? {
        firstName: user.manager_first_name,
        lastName: user.manager_last_name
      } : null
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({ token });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

module.exports = router;