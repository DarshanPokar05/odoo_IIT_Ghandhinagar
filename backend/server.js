const express = require('express');
const app = express();

// Simple in-memory storage
let companies = [{ id: 1, name: 'Demo Company', base_currency: 'USD' }];
let users = [{
  id: 1, companyId: 1, email: 'admin@demo.com', password: 'admin123',
  firstName: 'Admin', lastName: 'User', role: 'admin'
}];
let expenses = [];
let categories = [
  { id: 1, company_id: 1, name: 'Food', description: 'Meals and dining' },
  { id: 2, company_id: 1, name: 'Travel', description: 'Transportation' },
  { id: 3, company_id: 1, name: 'Office', description: 'Office supplies' }
];
let currentId = 2;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3001');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  const userId = parseInt(token.split('-')[1]);
  req.user = users.find(u => u.id === userId);
  if (!req.user) return res.status(401).json({ error: 'Invalid token' });
  next();
};

// Routes
app.get('/api/companies/currencies', (req, res) => {
  res.json(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR']);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  res.json({
    message: 'Login successful',
    token: `token-${user.id}`,
    user: {
      id: user.id, email: user.email, firstName: user.firstName,
      lastName: user.lastName, role: user.role, companyId: user.companyId,
      companyName: 'Demo Company', baseCurrency: 'USD'
    }
  });
});

app.get('/api/auth/profile', auth, (req, res) => {
  res.json({
    id: req.user.id, email: req.user.email, firstName: req.user.firstName,
    lastName: req.user.lastName, role: req.user.role, companyId: req.user.companyId,
    companyName: 'Demo Company', baseCurrency: 'USD'
  });
});

app.get('/api/companies/profile', auth, (req, res) => {
  res.json({
    id: 1, name: 'Demo Company', base_currency: 'USD',
    expense_stats: {
      total_expenses: expenses.length,
      approved_expenses: expenses.filter(e => e.status === 'approved').length,
      pending_expenses: expenses.filter(e => e.status === 'pending').length,
      rejected_expenses: expenses.filter(e => e.status === 'rejected').length,
      total_approved_amount: expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0),
      total_pending_amount: expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0)
    }
  });
});

app.get('/api/expenses', auth, (req, res) => {
  const userExpenses = req.user.role === 'employee' 
    ? expenses.filter(e => e.employee_id === req.user.id)
    : expenses;
  
  const expensesWithDetails = userExpenses.map(e => ({
    ...e,
    first_name: users.find(u => u.id === e.employee_id)?.firstName,
    last_name: users.find(u => u.id === e.employee_id)?.lastName,
    category_name: categories.find(c => c.id === e.category_id)?.name,
    base_currency: 'USD'
  }));

  res.json({ expenses: expensesWithDetails, pagination: { page: 1, limit: 10, total: expensesWithDetails.length, pages: 1 } });
});

app.get('/api/expenses/categories/list', auth, (req, res) => {
  res.json(categories);
});

app.post('/api/expenses', auth, (req, res) => {
  const { categoryId, amount, currency, description, expenseDate, merchantName } = req.body;
  
  const expense = {
    id: ++currentId,
    employee_id: req.user.id,
    company_id: req.user.companyId,
    category_id: parseInt(categoryId),
    amount: parseFloat(amount),
    currency,
    converted_amount: parseFloat(amount),
    description,
    expense_date: expenseDate,
    merchant_name: merchantName,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  expenses.push(expense);
  res.status(201).json({ message: 'Expense created successfully', expenseId: expense.id });
});

app.get('/api/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const userList = users.map(u => ({ ...u, password: undefined }));
  res.json({ users: userList, pagination: { page: 1, limit: 10, total: userList.length, pages: 1 } });
});

app.post('/api/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  
  const { firstName, lastName, email, password, role, managerId } = req.body;
  
  const newUser = {
    id: ++currentId,
    companyId: req.user.companyId,
    email, password, firstName, lastName, role,
    manager_id: managerId || null
  };
  
  users.push(newUser);
  res.status(201).json({ message: 'User created successfully', user: { ...newUser, password: undefined } });
});

app.get('/api/users/managers/list', auth, (req, res) => {
  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');
  res.json(managers.map(u => ({ id: u.id, first_name: u.firstName, last_name: u.lastName, email: u.email })));
});

app.get('/api/approvals/pending', auth, (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'Access denied' });
  
  const pendingExpenses = expenses.filter(e => e.status === 'pending').map(e => ({
    ...e,
    first_name: users.find(u => u.id === e.employee_id)?.firstName,
    last_name: users.find(u => u.id === e.employee_id)?.lastName,
    email: users.find(u => u.id === e.employee_id)?.email,
    category_name: categories.find(c => c.id === e.category_id)?.name,
    base_currency: 'USD'
  }));
  
  res.json({ approvals: pendingExpenses, pagination: { page: 1, limit: 10, total: pendingExpenses.length, pages: 1 } });
});

app.post('/api/approvals/:expenseId/process', auth, (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'Access denied' });
  
  const { action } = req.body;
  const expenseId = parseInt(req.params.expenseId);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  
  expense.status = action;
  res.json({ message: `Expense ${action} successfully`, expenseUpdated: true, finalStatus: action });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Default admin: admin@demo.com / admin123');
});