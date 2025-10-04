const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const approvalService = require('../services/approvalService');

const router = express.Router();

// Validation schemas
const approvalActionSchema = Joi.object({
  action: Joi.string().valid('approved', 'rejected').required(),
  comments: Joi.string().max(500).optional()
});

const approvalRuleSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  ruleType: Joi.string().valid('sequential', 'percentage', 'specific_approver', 'hybrid').required(),
  minAmount: Joi.number().min(0).default(0),
  maxAmount: Joi.number().positive().optional(),
  percentageRequired: Joi.number().min(1).max(100).when('ruleType', {
    is: Joi.string().valid('percentage', 'hybrid'),
    then: Joi.required()
  }),
  specificApproverId: Joi.number().integer().when('ruleType', {
    is: Joi.string().valid('specific_approver', 'hybrid'),
    then: Joi.required()
  }),
  sequenceOrder: Joi.number().integer().min(1).default(1),
  steps: Joi.array().items(Joi.object({
    stepOrder: Joi.number().integer().min(1).required(),
    approverRole: Joi.string().valid('manager', 'admin', 'specific_user').required(),
    approverId: Joi.number().integer().when('approverRole', {
      is: 'specific_user',
      then: Joi.required()
    }),
    isRequired: Joi.boolean().default(true)
  })).when('ruleType', {
    is: 'sequential',
    then: Joi.required()
  })
});

// Get pending approvals for current user
router.get('/pending', authenticateToken, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT e.id, e.amount, e.currency, e.converted_amount, e.description, 
             e.expense_date, e.receipt_url, e.created_at,
             u.first_name, u.last_name, u.email,
             c.name as category_name,
             ea.step_order, ea.comments as approval_comments,
             co.base_currency
      FROM expense_approvals ea
      JOIN expenses e ON ea.expense_id = e.id
      JOIN users u ON e.employee_id = u.id
      JOIN expense_categories c ON e.category_id = c.id
      JOIN companies co ON e.company_id = co.id
      WHERE ea.approver_id = $1 
      AND ea.status = 'pending'
      AND e.status = 'pending'
      ORDER BY e.created_at ASC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) 
      FROM expense_approvals ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE ea.approver_id = $1 
      AND ea.status = 'pending'
      AND e.status = 'pending'
    `, [req.user.id]);

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      approvals: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// Process approval (approve/reject)
router.post('/:expenseId/process', authenticateToken, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { error, value } = approvalActionSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { action, comments } = value;

    // Check if user has pending approval for this expense
    const pendingApproval = await db.query(`
      SELECT ea.id 
      FROM expense_approvals ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE ea.expense_id = $1 
      AND ea.approver_id = $2 
      AND ea.status = 'pending'
      AND e.company_id = $3
    `, [expenseId, req.user.id, req.user.company_id]);

    if (pendingApproval.rows.length === 0) {
      return res.status(404).json({ error: 'No pending approval found for this expense' });
    }

    const result = await approvalService.processApproval(expenseId, req.user.id, action, comments);

    res.json({
      message: `Expense ${action} successfully`,
      expenseUpdated: result.update,
      finalStatus: result.status
    });

  } catch (error) {
    console.error('Process approval error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

// Get approval history for an expense
router.get('/:expenseId/history', authenticateToken, async (req, res) => {
  try {
    const { expenseId } = req.params;

    // Check if user has access to this expense
    const expense = await db.query(`
      SELECT e.employee_id, e.company_id 
      FROM expenses e 
      WHERE e.id = $1
    `, [expenseId]);

    if (expense.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expenseData = expense.rows[0];

    // Check permissions
    if (req.user.role === 'employee' && expenseData.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (expenseData.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT ea.*, u.first_name, u.last_name, u.role, u.email
      FROM expense_approvals ea
      JOIN users u ON ea.approver_id = u.id
      WHERE ea.expense_id = $1
      ORDER BY ea.step_order ASC, ea.created_at ASC
    `, [expenseId]);

    res.json(result.rows);

  } catch (error) {
    console.error('Get approval history error:', error);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

// Admin: Override approval (force approve/reject)
router.post('/:expenseId/override', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { error, value } = approvalActionSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { action, comments } = value;

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Update expense status
      await client.query(`
        UPDATE expenses 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND company_id = $3
      `, [action, expenseId, req.user.company_id]);

      // Update all pending approvals
      await client.query(`
        UPDATE expense_approvals 
        SET status = $1, comments = $2, approved_at = CURRENT_TIMESTAMP
        WHERE expense_id = $3 AND status = 'pending'
      `, [action, `Admin override: ${comments || ''}`, expenseId]);

      // Create audit log
      await client.query(`
        INSERT INTO audit_logs (user_id, expense_id, action, new_values)
        VALUES ($1, $2, 'admin_override', $3)
      `, [req.user.id, expenseId, JSON.stringify({ action, comments })]);

      // Create notification
      const expense = await client.query(
        'SELECT employee_id FROM expenses WHERE id = $1',
        [expenseId]
      );

      if (expense.rows.length > 0) {
        await client.query(`
          INSERT INTO notifications (user_id, expense_id, type, title, message)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          expense.rows[0].employee_id,
          expenseId,
          'admin_override',
          `Expense ${action} by Admin`,
          `Your expense has been ${action} by an administrator`
        ]);
      }

      await client.query('COMMIT');

      res.json({ message: `Expense ${action} successfully (admin override)` });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Admin override error:', error);
    res.status(500).json({ error: 'Failed to override approval' });
  }
});

// Admin: Get all approval rules
router.get('/rules', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ar.*, u.first_name, u.last_name
      FROM approval_rules ar
      LEFT JOIN users u ON ar.specific_approver_id = u.id
      WHERE ar.company_id = $1
      ORDER BY ar.sequence_order ASC, ar.min_amount ASC
    `, [req.user.company_id]);

    // Get rule steps for sequential rules
    for (const rule of result.rows) {
      if (rule.rule_type === 'sequential') {
        const steps = await db.query(`
          SELECT ars.*, u.first_name, u.last_name
          FROM approval_rule_steps ars
          LEFT JOIN users u ON ars.approver_id = u.id
          WHERE ars.rule_id = $1
          ORDER BY ars.step_order ASC
        `, [rule.id]);
        
        rule.steps = steps.rows;
      }
    }

    res.json(result.rows);

  } catch (error) {
    console.error('Get approval rules error:', error);
    res.status(500).json({ error: 'Failed to fetch approval rules' });
  }
});

// Admin: Create approval rule
router.post('/rules', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error, value } = approvalRuleSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      name, ruleType, minAmount, maxAmount, percentageRequired,
      specificApproverId, sequenceOrder, steps
    } = value;

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Create approval rule
      const ruleResult = await client.query(`
        INSERT INTO approval_rules (company_id, name, rule_type, min_amount, max_amount,
                                  percentage_required, specific_approver_id, sequence_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [req.user.company_id, name, ruleType, minAmount, maxAmount,
          percentageRequired, specificApproverId, sequenceOrder]);

      const ruleId = ruleResult.rows[0].id;

      // Create rule steps for sequential rules
      if (ruleType === 'sequential' && steps) {
        for (const step of steps) {
          await client.query(`
            INSERT INTO approval_rule_steps (rule_id, step_order, approver_role, approver_id, is_required)
            VALUES ($1, $2, $3, $4, $5)
          `, [ruleId, step.stepOrder, step.approverRole, step.approverId, step.isRequired]);
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Approval rule created successfully',
        ruleId
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Create approval rule error:', error);
    res.status(500).json({ error: 'Failed to create approval rule' });
  }
});

// Admin: Update approval rule
router.put('/rules/:ruleId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { error, value } = approvalRuleSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      name, ruleType, minAmount, maxAmount, percentageRequired,
      specificApproverId, sequenceOrder, steps
    } = value;

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Update approval rule
      await client.query(`
        UPDATE approval_rules 
        SET name = $1, rule_type = $2, min_amount = $3, max_amount = $4,
            percentage_required = $5, specific_approver_id = $6, sequence_order = $7
        WHERE id = $8 AND company_id = $9
      `, [name, ruleType, minAmount, maxAmount, percentageRequired,
          specificApproverId, sequenceOrder, ruleId, req.user.company_id]);

      // Delete existing steps and recreate for sequential rules
      await client.query('DELETE FROM approval_rule_steps WHERE rule_id = $1', [ruleId]);

      if (ruleType === 'sequential' && steps) {
        for (const step of steps) {
          await client.query(`
            INSERT INTO approval_rule_steps (rule_id, step_order, approver_role, approver_id, is_required)
            VALUES ($1, $2, $3, $4, $5)
          `, [ruleId, step.stepOrder, step.approverRole, step.approverId, step.isRequired]);
        }
      }

      await client.query('COMMIT');

      res.json({ message: 'Approval rule updated successfully' });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Update approval rule error:', error);
    res.status(500).json({ error: 'Failed to update approval rule' });
  }
});

// Admin: Delete approval rule
router.delete('/rules/:ruleId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { ruleId } = req.params;

    // Check if rule is in use
    const inUse = await db.query(
      'SELECT COUNT(*) FROM expenses WHERE approval_rule_id = $1',
      [ruleId]
    );

    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete approval rule that is in use by existing expenses' 
      });
    }

    await db.query(
      'DELETE FROM approval_rules WHERE id = $1 AND company_id = $2',
      [ruleId, req.user.company_id]
    );

    res.json({ message: 'Approval rule deleted successfully' });

  } catch (error) {
    console.error('Delete approval rule error:', error);
    res.status(500).json({ error: 'Failed to delete approval rule' });
  }
});

module.exports = router;