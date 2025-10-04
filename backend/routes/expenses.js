const express = require('express');
const multer = require('multer');
const path = require('path');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, requireRole, requireSameCompany } = require('../middleware/auth');
const currencyService = require('../services/currencyService');
const ocrService = require('../services/ocrService');
const approvalService = require('../services/approvalService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/receipts/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, JPG, PNG) and PDF files are allowed'));
    }
  }
});

// Validation schemas
const expenseSchema = Joi.object({
  categoryId: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).required(),
  description: Joi.string().min(5).max(500).required(),
  expenseDate: Joi.date().max('now').required(),
  merchantName: Joi.string().max(255).optional()
});

// Create expense
router.post('/', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    const { error, value } = expenseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { categoryId, amount, currency, description, expenseDate, merchantName } = value;
    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get company base currency
      const company = await client.query(
        'SELECT base_currency FROM companies WHERE id = $1',
        [req.user.company_id]
      );
      const baseCurrency = company.rows[0].base_currency;

      // Convert amount to base currency
      let convertedAmount = amount;
      if (currency !== baseCurrency) {
        convertedAmount = await currencyService.convertCurrency(amount, currency, baseCurrency);
      }

      // Create expense
      const expenseResult = await client.query(`
        INSERT INTO expenses (employee_id, company_id, category_id, amount, currency, 
                            converted_amount, description, expense_date, receipt_url, merchant_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [req.user.id, req.user.company_id, categoryId, amount, currency, 
          convertedAmount, description, expenseDate, receiptUrl, merchantName]);

      const expenseId = expenseResult.rows[0].id;

      // Get applicable approval rule
      const rule = await approvalService.getApplicableRule(convertedAmount, req.user.company_id);
      
      if (rule) {
        // Update expense with approval rule
        await client.query(
          'UPDATE expenses SET approval_rule_id = $1 WHERE id = $2',
          [rule.id, expenseId]
        );

        // Create approval workflow
        await approvalService.createApprovalWorkflow(expenseId, rule.id);
      } else {
        // No approval rule - auto approve small expenses
        await client.query(
          'UPDATE expenses SET status = $1 WHERE id = $2',
          ['approved', expenseId]
        );
      }

      // Process OCR if receipt uploaded
      if (req.file && ['.jpg', '.jpeg', '.png'].includes(path.extname(req.file.filename).toLowerCase())) {
        const ocrResult = await ocrService.processReceipt(req.file.path);
        
        await client.query(`
          INSERT INTO ocr_results (expense_id, extracted_amount, extracted_date, 
                                 extracted_merchant, extracted_category, confidence_score, raw_text)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [expenseId, ocrResult.amount, ocrResult.date, ocrResult.merchant, 
            ocrResult.category, ocrResult.confidence, ocrResult.rawText]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Expense created successfully',
        expenseId,
        convertedAmount,
        baseCurrency
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Get expenses (with filtering and pagination)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      category, 
      startDate, 
      endDate,
      employeeId 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE e.company_id = $1';
    let params = [req.user.company_id];
    let paramCount = 1;

    // Role-based filtering
    if (req.user.role === 'employee') {
      whereClause += ` AND e.employee_id = $${++paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      // Managers see their team's expenses
      whereClause += ` AND (e.employee_id = $${++paramCount} OR u.manager_id = $${paramCount})`;
      params.push(req.user.id);
    }

    // Additional filters
    if (status) {
      whereClause += ` AND e.status = $${++paramCount}`;
      params.push(status);
    }

    if (category) {
      whereClause += ` AND e.category_id = $${++paramCount}`;
      params.push(category);
    }

    if (startDate) {
      whereClause += ` AND e.expense_date >= $${++paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND e.expense_date <= $${++paramCount}`;
      params.push(endDate);
    }

    if (employeeId && req.user.role !== 'employee') {
      whereClause += ` AND e.employee_id = $${++paramCount}`;
      params.push(employeeId);
    }

    const query = `
      SELECT e.*, 
             u.first_name, u.last_name, u.email,
             c.name as category_name,
             co.base_currency
      FROM expenses e
      JOIN users u ON e.employee_id = u.id
      JOIN expense_categories c ON e.category_id = c.id
      JOIN companies co ON e.company_id = co.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM expenses e
      JOIN users u ON e.employee_id = u.id
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      expenses: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Get single expense
router.get('/:id', authenticateToken, requireSameCompany, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT e.*, 
             u.first_name, u.last_name, u.email,
             c.name as category_name,
             co.base_currency,
             ocr.extracted_amount, ocr.extracted_date, ocr.extracted_merchant, 
             ocr.extracted_category, ocr.confidence_score
      FROM expenses e
      JOIN users u ON e.employee_id = u.id
      JOIN expense_categories c ON e.category_id = c.id
      JOIN companies co ON e.company_id = co.id
      LEFT JOIN ocr_results ocr ON e.id = ocr.expense_id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Get approval history
    const approvals = await db.query(`
      SELECT ea.*, u.first_name, u.last_name, u.role
      FROM expense_approvals ea
      JOIN users u ON ea.approver_id = u.id
      WHERE ea.expense_id = $1
      ORDER BY ea.step_order ASC, ea.created_at ASC
    `, [id]);

    const expense = result.rows[0];
    expense.approvals = approvals.rows;

    res.json(expense);

  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// Update expense (only by employee who created it, and only if pending)
router.put('/:id', authenticateToken, requireSameCompany, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = expenseSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if expense exists and is editable
    const expense = await db.query(
      'SELECT employee_id, status FROM expenses WHERE id = $1',
      [id]
    );

    if (expense.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (expense.rows[0].employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only edit your own expenses' });
    }

    if (expense.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Can only edit pending expenses' });
    }

    const { categoryId, amount, currency, description, expenseDate, merchantName } = value;

    // Convert amount to base currency
    const company = await db.query(
      'SELECT base_currency FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const baseCurrency = company.rows[0].base_currency;

    let convertedAmount = amount;
    if (currency !== baseCurrency) {
      convertedAmount = await currencyService.convertCurrency(amount, currency, baseCurrency);
    }

    await db.query(`
      UPDATE expenses 
      SET category_id = $1, amount = $2, currency = $3, converted_amount = $4,
          description = $5, expense_date = $6, merchant_name = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [categoryId, amount, currency, convertedAmount, description, expenseDate, merchantName, id]);

    res.json({ message: 'Expense updated successfully' });

  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense (only by employee who created it, and only if pending)
router.delete('/:id', authenticateToken, requireSameCompany, async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await db.query(
      'SELECT employee_id, status FROM expenses WHERE id = $1',
      [id]
    );

    if (expense.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (expense.rows[0].employee_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (expense.rows[0].status !== 'pending' && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Can only delete pending expenses' });
    }

    await db.query('DELETE FROM expenses WHERE id = $1', [id]);

    res.json({ message: 'Expense deleted successfully' });

  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Get expense categories
router.get('/categories/list', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM expense_categories WHERE company_id = $1 AND is_active = true ORDER BY name',
      [req.user.company_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// OCR processing endpoint
router.post('/ocr/process', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Receipt image required' });
    }

    const ocrResult = await ocrService.processReceipt(req.file.path);
    
    res.json({
      success: ocrResult.success,
      data: {
        amount: ocrResult.amount,
        date: ocrResult.date,
        merchant: ocrResult.merchant,
        category: ocrResult.category,
        confidence: ocrResult.confidence
      }
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

module.exports = router;