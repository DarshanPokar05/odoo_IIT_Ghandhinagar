const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const currencyService = require('../services/currencyService');

const router = express.Router();

// Validation schemas
const updateCompanySchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  baseCurrency: Joi.string().length(3).optional()
});

const categorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional()
});

// Get company details
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, 
             COUNT(u.id) as total_users,
             COUNT(CASE WHEN u.role = 'employee' THEN 1 END) as employees,
             COUNT(CASE WHEN u.role = 'manager' THEN 1 END) as managers,
             COUNT(CASE WHEN u.role = 'admin' THEN 1 END) as admins
      FROM companies c
      LEFT JOIN users u ON c.id = u.company_id AND u.is_active = true
      WHERE c.id = $1
      GROUP BY c.id
    `, [req.user.company_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = result.rows[0];

    // Get expense statistics
    const expenseStats = await db.query(`
      SELECT 
        COUNT(*) as total_expenses,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_expenses,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_expenses,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_expenses,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN converted_amount END), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN converted_amount END), 0) as total_pending_amount
      FROM expenses 
      WHERE company_id = $1
    `, [req.user.company_id]);

    company.expense_stats = expenseStats.rows[0];

    res.json(company);

  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

// Admin: Update company details
router.put('/profile', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error, value } = updateCompanySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, baseCurrency } = value;

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      params.push(name);
    }

    if (baseCurrency !== undefined) {
      // Validate currency
      const supportedCurrencies = await currencyService.getSupportedCurrencies();
      if (!supportedCurrencies.includes(baseCurrency)) {
        return res.status(400).json({ error: 'Unsupported currency' });
      }

      updates.push(`base_currency = $${++paramCount}`);
      params.push(baseCurrency);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.user.company_id);

    const query = `
      UPDATE companies 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;

    const result = await db.query(query, params);

    res.json({
      message: 'Company updated successfully',
      company: result.rows[0]
    });

  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Get supported currencies
router.get('/currencies', authenticateToken, async (req, res) => {
  try {
    const currencies = await currencyService.getSupportedCurrencies();
    res.json(currencies);
  } catch (error) {
    console.error('Get currencies error:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// Get expense categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM expense_categories 
      WHERE company_id = $1 AND is_active = true 
      ORDER BY name
    `, [req.user.company_id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Admin: Create expense category
router.post('/categories', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description } = value;

    // Check if category already exists
    const existing = await db.query(
      'SELECT id FROM expense_categories WHERE company_id = $1 AND name = $2',
      [req.user.company_id, name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const result = await db.query(`
      INSERT INTO expense_categories (company_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [req.user.company_id, name, description]);

    res.status(201).json({
      message: 'Category created successfully',
      category: result.rows[0]
    });

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Admin: Update expense category
router.put('/categories/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = categorySchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description } = value;

    // Check if category exists
    const existing = await db.query(
      'SELECT id FROM expense_categories WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = await db.query(`
      UPDATE expense_categories 
      SET name = $1, description = $2
      WHERE id = $3 AND company_id = $4
      RETURNING *
    `, [name, description, id, req.user.company_id]);

    res.json({
      message: 'Category updated successfully',
      category: result.rows[0]
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Admin: Delete expense category
router.delete('/categories/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category is in use
    const inUse = await db.query(
      'SELECT COUNT(*) FROM expenses WHERE category_id = $1',
      [id]
    );

    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is in use by existing expenses' 
      });
    }

    const result = await db.query(
      'DELETE FROM expense_categories WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get company analytics/dashboard data
router.get('/analytics', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    
    // Expense trends
    const expenseTrends = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(converted_amount) as total_amount,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
      FROM expenses 
      WHERE company_id = $1 
      AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [req.user.company_id]);

    // Category breakdown
    const categoryBreakdown = await db.query(`
      SELECT 
        c.name,
        COUNT(e.id) as expense_count,
        SUM(e.converted_amount) as total_amount,
        AVG(e.converted_amount) as avg_amount
      FROM expense_categories c
      LEFT JOIN expenses e ON c.id = e.category_id 
        AND e.company_id = $1 
        AND e.created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
      WHERE c.company_id = $1 AND c.is_active = true
      GROUP BY c.id, c.name
      ORDER BY total_amount DESC NULLS LAST
    `, [req.user.company_id]);

    // Top spenders
    const topSpenders = await db.query(`
      SELECT 
        u.first_name, u.last_name, u.email,
        COUNT(e.id) as expense_count,
        SUM(e.converted_amount) as total_amount
      FROM users u
      LEFT JOIN expenses e ON u.id = e.employee_id 
        AND e.created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
        AND e.status = 'approved'
      WHERE u.company_id = $1 AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name, u.email
      HAVING COUNT(e.id) > 0
      ORDER BY total_amount DESC
      LIMIT 10
    `, [req.user.company_id]);

    // Approval metrics
    const approvalMetrics = await db.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (approved_at - created_at))/3600) as avg_approval_time_hours,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
      FROM expense_approvals ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE e.company_id = $1 
      AND ea.created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
    `, [req.user.company_id]);

    res.json({
      period: parseInt(period),
      expenseTrends: expenseTrends.rows,
      categoryBreakdown: categoryBreakdown.rows,
      topSpenders: topSpenders.rows,
      approvalMetrics: approvalMetrics.rows[0]
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Export expenses (CSV format)
router.get('/export/expenses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate, status, format = 'csv' } = req.query;

    let whereClause = 'WHERE e.company_id = $1';
    let params = [req.user.company_id];
    let paramCount = 1;

    if (startDate) {
      whereClause += ` AND e.expense_date >= $${++paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND e.expense_date <= $${++paramCount}`;
      params.push(endDate);
    }

    if (status) {
      whereClause += ` AND e.status = $${++paramCount}`;
      params.push(status);
    }

    const result = await db.query(`
      SELECT 
        e.id,
        u.first_name || ' ' || u.last_name as employee_name,
        u.email as employee_email,
        c.name as category,
        e.amount,
        e.currency,
        e.converted_amount,
        co.base_currency,
        e.description,
        e.expense_date,
        e.merchant_name,
        e.status,
        e.created_at
      FROM expenses e
      JOIN users u ON e.employee_id = u.id
      JOIN expense_categories c ON e.category_id = c.id
      JOIN companies co ON e.company_id = co.id
      ${whereClause}
      ORDER BY e.created_at DESC
    `, params);

    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'ID,Employee Name,Employee Email,Category,Amount,Currency,Converted Amount,Base Currency,Description,Expense Date,Merchant,Status,Created At\n';
      const csvRows = result.rows.map(row => 
        `${row.id},"${row.employee_name}","${row.employee_email}","${row.category}",${row.amount},"${row.currency}",${row.converted_amount},"${row.base_currency}","${row.description}","${row.expense_date}","${row.merchant_name || ''}","${row.status}","${row.created_at}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
      res.send(csvHeader + csvRows);
    } else {
      res.json(result.rows);
    }

  } catch (error) {
    console.error('Export expenses error:', error);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

module.exports = router;