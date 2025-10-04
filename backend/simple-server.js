const http = require('http');
const url = require('url');

const data = {
  users: [{ id: 1, email: 'admin@demo.com', password: 'admin123', firstName: 'Admin', lastName: 'User', role: 'admin' }],
  expenses: [],
  categories: [
    { id: 1, name: 'Food' }, { id: 2, name: 'Travel' }, { id: 3, name: 'Office' }
  ]
};

const server = http.createServer((req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      const reqData = body ? JSON.parse(body) : {};
      
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const user = data.users.find(u => u.email === reqData.email && u.password === reqData.password);
        if (user) {
          res.writeHead(200);
          res.end(JSON.stringify({
            token: 'token-1',
            user: { ...user, companyName: 'Demo Company', baseCurrency: 'USD' }
          }));
        } else {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
        }
      }
      else if (pathname === '/api/auth/profile') {
        res.writeHead(200);
        res.end(JSON.stringify(data.users[0]));
      }
      else if (pathname === '/api/companies/profile') {
        res.writeHead(200);
        res.end(JSON.stringify({
          name: 'Demo Company',
          expense_stats: { total_expenses: 0, approved_expenses: 0, pending_expenses: 0, rejected_expenses: 0 }
        }));
      }
      else if (pathname === '/api/companies/currencies') {
        res.writeHead(200);
        res.end(JSON.stringify(['USD', 'EUR', 'GBP', 'JPY']));
      }
      else if (pathname === '/api/expenses/categories/list') {
        res.writeHead(200);
        res.end(JSON.stringify(data.categories));
      }
      else if (pathname === '/api/expenses' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ expenses: data.expenses }));
      }
      else if (pathname === '/api/expenses' && req.method === 'POST') {
        const expense = { id: Date.now(), ...reqData, status: 'pending' };
        data.expenses.push(expense);
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Created' }));
      }
      else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
});

server.listen(3000, () => console.log('Server on port 3000\nLogin: admin@demo.com / admin123'));