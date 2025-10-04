const db = require('../config/database');

class ApprovalService {
  async getApplicableRule(expenseAmount, companyId) {
    try {
      const result = await db.query(`
        SELECT * FROM approval_rules 
        WHERE company_id = $1 
        AND is_active = true 
        AND (min_amount IS NULL OR $2 >= min_amount)
        AND (max_amount IS NULL OR $2 <= max_amount)
        ORDER BY min_amount DESC, sequence_order ASC
        LIMIT 1
      `, [companyId, expenseAmount]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting applicable rule:', error);
      throw error;
    }
  }

  async createApprovalWorkflow(expenseId, ruleId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const rule = await client.query(
        'SELECT * FROM approval_rules WHERE id = $1',
        [ruleId]
      );

      if (rule.rows.length === 0) {
        throw new Error('Approval rule not found');
      }

      const approvalRule = rule.rows[0];

      if (approvalRule.rule_type === 'sequential') {
        await this.createSequentialApprovals(client, expenseId, ruleId);
      } else if (approvalRule.rule_type === 'percentage') {
        await this.createPercentageApprovals(client, expenseId, ruleId);
      } else if (approvalRule.rule_type === 'specific_approver') {
        await this.createSpecificApproverApproval(client, expenseId, approvalRule.specific_approver_id);
      } else if (approvalRule.rule_type === 'hybrid') {
        await this.createHybridApprovals(client, expenseId, ruleId);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createSequentialApprovals(client, expenseId, ruleId) {
    const steps = await client.query(`
      SELECT * FROM approval_rule_steps 
      WHERE rule_id = $1 
      ORDER BY step_order ASC
    `, [ruleId]);

    for (const step of steps.rows) {
      let approverId = step.approver_id;

      if (step.approver_role === 'manager') {
        // Get employee's manager
        const expense = await client.query(
          'SELECT employee_id FROM expenses WHERE id = $1',
          [expenseId]
        );
        
        const manager = await client.query(
          'SELECT manager_id FROM users WHERE id = $1',
          [expense.rows[0].employee_id]
        );
        
        approverId = manager.rows[0]?.manager_id;
      }

      if (approverId) {
        await client.query(`
          INSERT INTO expense_approvals (expense_id, approver_id, step_order, status)
          VALUES ($1, $2, $3, 'pending')
        `, [expenseId, approverId, step.step_order]);
      }
    }
  }

  async createPercentageApprovals(client, expenseId, ruleId) {
    const rule = await client.query(
      'SELECT percentage_required FROM approval_rules WHERE id = $1',
      [ruleId]
    );

    // Get all managers and admins in the company
    const expense = await client.query(
      'SELECT company_id FROM expenses WHERE id = $1',
      [expenseId]
    );

    const approvers = await client.query(`
      SELECT id FROM users 
      WHERE company_id = $1 
      AND role IN ('manager', 'admin') 
      AND is_active = true
    `, [expense.rows[0].company_id]);

    // Create approval entries for all potential approvers
    for (let i = 0; i < approvers.rows.length; i++) {
      await client.query(`
        INSERT INTO expense_approvals (expense_id, approver_id, step_order, status)
        VALUES ($1, $2, $3, 'pending')
      `, [expenseId, approvers.rows[i].id, 1]);
    }
  }

  async createSpecificApproverApproval(client, expenseId, approverId) {
    await client.query(`
      INSERT INTO expense_approvals (expense_id, approver_id, step_order, status)
      VALUES ($1, $2, 1, 'pending')
    `, [expenseId, approverId]);
  }

  async createHybridApprovals(client, expenseId, ruleId) {
    // Implement both percentage and specific approver logic
    await this.createPercentageApprovals(client, expenseId, ruleId);
    
    const rule = await client.query(
      'SELECT specific_approver_id FROM approval_rules WHERE id = $1',
      [ruleId]
    );

    if (rule.rows[0].specific_approver_id) {
      await this.createSpecificApproverApproval(client, expenseId, rule.rows[0].specific_approver_id);
    }
  }

  async processApproval(expenseId, approverId, action, comments) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Update the approval
      await client.query(`
        UPDATE expense_approvals 
        SET status = $1, comments = $2, approved_at = CURRENT_TIMESTAMP
        WHERE expense_id = $3 AND approver_id = $4 AND status = 'pending'
      `, [action, comments, expenseId, approverId]);

      // Check if expense should be approved/rejected
      const shouldUpdateExpense = await this.shouldUpdateExpenseStatus(client, expenseId, action);
      
      if (shouldUpdateExpense.update) {
        await client.query(`
          UPDATE expenses 
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [shouldUpdateExpense.status, expenseId]);

        // Create notification
        const expense = await client.query(
          'SELECT employee_id FROM expenses WHERE id = $1',
          [expenseId]
        );

        await client.query(`
          INSERT INTO notifications (user_id, expense_id, type, title, message)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          expense.rows[0].employee_id,
          expenseId,
          'expense_status_update',
          `Expense ${shouldUpdateExpense.status}`,
          `Your expense has been ${shouldUpdateExpense.status}`
        ]);
      }

      await client.query('COMMIT');
      return shouldUpdateExpense;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async shouldUpdateExpenseStatus(client, expenseId, action) {
    const expense = await client.query(
      'SELECT approval_rule_id FROM expenses WHERE id = $1',
      [expenseId]
    );

    const rule = await client.query(
      'SELECT rule_type, percentage_required FROM approval_rules WHERE id = $1',
      [expense.rows[0].approval_rule_id]
    );

    if (rule.rows.length === 0) {
      return { update: false };
    }

    const approvalRule = rule.rows[0];

    if (action === 'rejected') {
      return { update: true, status: 'rejected' };
    }

    if (approvalRule.rule_type === 'sequential') {
      return await this.checkSequentialApproval(client, expenseId);
    } else if (approvalRule.rule_type === 'percentage') {
      return await this.checkPercentageApproval(client, expenseId, approvalRule.percentage_required);
    } else if (approvalRule.rule_type === 'specific_approver') {
      return { update: true, status: 'approved' };
    } else if (approvalRule.rule_type === 'hybrid') {
      return await this.checkHybridApproval(client, expenseId, approvalRule.percentage_required);
    }

    return { update: false };
  }

  async checkSequentialApproval(client, expenseId) {
    const approvals = await client.query(`
      SELECT status FROM expense_approvals 
      WHERE expense_id = $1 
      ORDER BY step_order ASC
    `, [expenseId]);

    const allApproved = approvals.rows.every(approval => approval.status === 'approved');
    const hasRejection = approvals.rows.some(approval => approval.status === 'rejected');

    if (hasRejection) {
      return { update: true, status: 'rejected' };
    } else if (allApproved) {
      return { update: true, status: 'approved' };
    }

    return { update: false };
  }

  async checkPercentageApproval(client, expenseId, requiredPercentage) {
    const approvals = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
      FROM expense_approvals 
      WHERE expense_id = $1
    `, [expenseId]);

    const { total, approved } = approvals.rows[0];
    const approvalPercentage = (approved / total) * 100;

    if (approvalPercentage >= requiredPercentage) {
      return { update: true, status: 'approved' };
    }

    return { update: false };
  }

  async checkHybridApproval(client, expenseId, requiredPercentage) {
    // Check if specific approver approved
    const specificApproval = await client.query(`
      SELECT ea.status FROM expense_approvals ea
      JOIN approval_rules ar ON ar.specific_approver_id = ea.approver_id
      JOIN expenses e ON e.approval_rule_id = ar.id
      WHERE e.id = $1 AND ea.status = 'approved'
    `, [expenseId]);

    if (specificApproval.rows.length > 0) {
      return { update: true, status: 'approved' };
    }

    // Otherwise check percentage
    return await this.checkPercentageApproval(client, expenseId, requiredPercentage);
  }
}

module.exports = new ApprovalService();