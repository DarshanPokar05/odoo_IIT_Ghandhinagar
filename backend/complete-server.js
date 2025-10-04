const http = require('http');
const url = require('url');

// In-memory database
const db = {
  companies: [{ id: 1, name: 'Demo Company', base_currency: 'USD' }],
  users: [{
    id: 1, company_id: 1, email: 'admin@demo.com', password: 'admin123',
    first_name: 'Admin', last_name: 'User', role: 'admin', is_active: true
  }],
  expenses: [],
  categories: [
    { id: 1, company_id: 1, name: 'Food', description: 'Meals and dining' },
    { id: 2, company_id: 1, name: 'Travel', description: 'Transportation' },
    { id: 3, company_id: 1, name: 'Office', description: 'Office supplies' }
  ],
  approvals: [],
  nextId: 2
};

const server = http.createServer((req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = body ? JSON.parse(body) : {};
      const token = req.headers.authorization?.split(' ')[1];
      let user = null;
      
      if (token && token.startsWith('token-')) {
        const userId = parseInt(token.split('-')[1]);
        user = db.users.find(u => u.id === userId);
      }

      // Routes
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const foundUser = db.users.find(u => u.email === data.email && u.password === data.password);
        if (foundUser) {
          res.writeHead(200);
          res.end(JSON.stringify({
            message: 'Login successful',
            token: `token-${foundUser.id}`,
            user: {
              id: foundUser.id,
              email: foundUser.email,
              firstName: foundUser.first_name,
              lastName: foundUser.last_name,
              role: foundUser.role,
              companyId: foundUser.company_id,
              companyName: 'Demo Company',
              baseCurrency: 'USD'
            }
          }));
        } else {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
        }
      }
      
      else if (pathname === '/api/auth/profile' && user) {
        res.writeHead(200);
        res.end(JSON.stringify({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          companyId: user.company_id,
          companyName: 'Demo Company',
          baseCurrency: 'USD'
        }));
      }
      
      else if (pathname === '/api/companies/profile' && user) {
        const totalExpenses = db.expenses.length;
        const approvedExpenses = db.expenses.filter(e => e.status === 'approved').length;
        const pendingExpenses = db.expenses.filter(e => e.status === 'pending').length;
        const rejectedExpenses = db.expenses.filter(e => e.status === 'rejected').length;
        
        res.writeHead(200);
        res.end(JSON.stringify({
          id: 1,
          name: 'Demo Company',
          base_currency: 'USD',
          expense_stats: {
            total_expenses: totalExpenses,
            approved_expenses: approvedExpenses,
            pending_expenses: pendingExpenses,
            rejected_expenses: rejectedExpenses,
            total_approved_amount: db.expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0),
            total_pending_amount: db.expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0)
          }
        }));
      }
      
      else if (pathname === '/api/companies/currencies') {
        res.writeHead(200);
        res.end(JSON.stringify(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR']));
      }
      
      else if (pathname === '/api/companies/categories' && user) {
        res.writeHead(200);
        res.end(JSON.stringify(db.categories));
      }
      
      else if (pathname === '/api/expenses/categories/list' && user) {
        res.writeHead(200);
        res.end(JSON.stringify(db.categories));
      }
      
      else if (pathname === '/api/expenses' && req.method === 'GET' && user) {
        const userExpenses = user.role === 'employee' 
          ? db.expenses.filter(e => e.employee_id === user.id)
          : db.expenses;
        
        const expensesWithDetails = userExpenses.map(e => ({
          ...e,
          first_name: db.users.find(u => u.id === e.employee_id)?.first_name,
          last_name: db.users.find(u => u.id === e.employee_id)?.last_name,
          category_name: db.categories.find(c => c.id === e.category_id)?.name,
          base_currency: 'USD'
        }));

        res.writeHead(200);
        res.end(JSON.stringify({
          expenses: expensesWithDetails,
          pagination: { page: 1, limit: 10, total: expensesWithDetails.length, pages: 1 }
        }));
      }
      
      else if (pathname === '/api/expenses' && req.method === 'POST' && user) {
        try {
          const expense = {
            id: db.nextId++,
            employee_id: user.id,
            company_id: user.company_id || 1,
            category_id: parseInt(data.categoryId) || 1,
            amount: parseFloat(data.amount) || 0,
            currency: data.currency || 'USD',
            converted_amount: parseFloat(data.amount) || 0,
            description: data.description || 'No description',
            expense_date: data.expenseDate || new Date().toISOString().split('T')[0],
            merchant_name: data.merchantName || null,
            status: 'pending',
            created_at: new Date().toISOString()
          };
          
          db.expenses.push(expense);
          res.writeHead(201);
          res.end(JSON.stringify({ message: 'Expense created successfully', expenseId: expense.id }));
        } catch (error) {
          console.error('Expense creation error:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to create expense: ' + error.message }));
        }
      }
      
      else if (pathname === '/api/users' && req.method === 'GET' && user && user.role === 'admin') {
        const userList = db.users.map(u => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role,
          is_active: u.is_active,
          created_at: new Date().toISOString()
        }));
        
        res.writeHead(200);
        res.end(JSON.stringify({
          users: userList,
          pagination: { page: 1, limit: 10, total: userList.length, pages: 1 }
        }));
      }
      
      else if (pathname === '/api/users' && req.method === 'POST' && user && user.role === 'admin') {
        const newUser = {
          id: db.nextId++,
          company_id: user.company_id,
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          role: data.role,
          manager_id: data.managerId || null,
          is_active: true
        };
        
        db.users.push(newUser);
        res.writeHead(201);
        res.end(JSON.stringify({
          message: 'User created successfully',
          user: { ...newUser, password: undefined }
        }));
      }
      
      else if (pathname === '/api/users/managers/list' && user && user.role === 'admin') {
        const managers = db.users.filter(u => u.role === 'manager' || u.role === 'admin');
        res.writeHead(200);
        res.end(JSON.stringify(managers.map(u => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email
        }))));
      }
      
      else if (pathname === '/api/approvals/pending' && user && (user.role === 'manager' || user.role === 'admin')) {
        const pendingExpenses = db.expenses.filter(e => e.status === 'pending').map(e => ({
          ...e,
          first_name: db.users.find(u => u.id === e.employee_id)?.first_name,
          last_name: db.users.find(u => u.id === e.employee_id)?.last_name,
          email: db.users.find(u => u.id === e.employee_id)?.email,
          category_name: db.categories.find(c => c.id === e.category_id)?.name,
          base_currency: 'USD'
        }));
        
        res.writeHead(200);
        res.end(JSON.stringify({
          approvals: pendingExpenses,
          pagination: { page: 1, limit: 10, total: pendingExpenses.length, pages: 1 }
        }));
      }
      
      else if (pathname.startsWith('/api/approvals/') && pathname.endsWith('/process') && req.method === 'POST' && user) {
        const expenseId = parseInt(pathname.split('/')[3]);
        const expense = db.expenses.find(e => e.id === expenseId);
        
        if (expense) {
          expense.status = data.action;
          res.writeHead(200);
          res.end(JSON.stringify({
            message: `Expense ${data.action} successfully`,
            expenseUpdated: true,
            finalStatus: data.action
          }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Expense not found' }));
        }
      }
      
      else if (pathname === '/api/approvals/rules' && user && user.role === 'admin') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      }
      
      else if (pathname === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'OK' }));
      }
      
      else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
      
    } catch (e) {
      console.error('Server error:', e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
});

server.listen(3000, () => {
  console.log('Complete server running on port 3000');
  console.log('Login: admin@demo.com / admin123');
});