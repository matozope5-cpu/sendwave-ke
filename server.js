const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory "database"
let users = [];
let transactions = [];
let nextUserId = 1;
let nextTxId = 1;

// Helper: find user by phone
function findUserByPhone(phone) {
  return users.find(u => u.phone === phone);
}

// Helper: generate a random reference
function genRef() {
  return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ---------- SIGNUP ----------
app.post('/api/signup', (req, res) => {
  const { first_name, last_name, phone, password } = req.body;
  if (!first_name || !last_name || !phone || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (findUserByPhone(phone)) {
    return res.status(400).json({ error: 'Phone number already registered' });
  }

  const newUser = {
    id: nextUserId++,
    first_name,
    last_name,
    phone,
    password, // plain text for demo (never do this in production!)
    balance: 0,
    created_at: new Date().toISOString()
  };
  users.push(newUser);

  // Create a token (fake JWT)
  const token = 'fake-jwt-' + newUser.id + '-' + Date.now();

  res.json({
    token,
    name: first_name + ' ' + last_name,
    balance: newUser.balance
  });
});

// ---------- LOGIN ----------
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password required' });
  }
  const user = findUserByPhone(phone);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = 'fake-jwt-' + user.id + '-' + Date.now();
  res.json({
    token,
    name: user.first_name + ' ' + user.last_name,
    balance: user.balance
  });
});

// ---------- GET /me ----------
app.get('/api/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  // Extract user id from fake token
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid token format' });
  }
  const token = parts[1];
  const userId = parseInt(token.split('-')[2]);
  if (!userId) return res.status(401).json({ error: 'Invalid token' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  res.json({
    id: user.id,
    name: user.first_name + ' ' + user.last_name,
    phone: user.phone,
    balance: user.balance,
    created_at: user.created_at
  });
});

// ---------- ADD FUNDS ----------
app.post('/api/add-funds', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid token' });
  const userId = parseInt(parts[1].split('-')[2]);
  if (!userId) return res.status(401).json({ error: 'Invalid token' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const { amount_usd } = req.body;
  if (!amount_usd || amount_usd <= 0) {
    return res.status(400).json({ error: 'Amount must be positive' });
  }
  user.balance += amount_usd;

  // Record transaction
  transactions.push({
    id: nextTxId++,
    user_id: user.id,
    type: 'added',
    amount_usd: amount_usd,
    amount_kes: Math.round(amount_usd * 129.5),
    status: 'completed',
    created_at: new Date().toISOString(),
    reference: genRef()
  });

  res.json({ new_balance: user.balance });
});

// ---------- SEND ----------
app.post('/api/send', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid token' });
  const userId = parseInt(parts[1].split('-')[2]);
  if (!userId) return res.status(401).json({ error: 'Invalid token' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const { recipient_name, recipient_phone, amount_usd } = req.body;
  if (!recipient_name || !recipient_phone || !amount_usd || amount_usd <= 0) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }
  if (amount_usd > user.balance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  user.balance -= amount_usd;
  const ref = genRef();
  transactions.push({
    id: nextTxId++,
    user_id: user.id,
    type: 'sent',
    recipient_name,
    recipient_phone,
    amount_usd,
    amount_kes: Math.round(amount_usd * 129.5),
    status: 'completed',
    created_at: new Date().toISOString(),
    reference: ref
  });

  res.json({
    reference: ref,
    new_balance: user.balance
  });
});

// ---------- GET /transactions ----------
app.get('/api/transactions', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid token' });
  const userId = parseInt(parts[1].split('-')[2]);
  if (!userId) return res.status(401).json({ error: 'Invalid token' });

  const userTxs = transactions.filter(t => t.user_id === userId);
  // Sort by most recent first
  userTxs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(userTxs);
});

// Serve static files (optional) – if you put your HTML in the same folder
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Open your HTML file (or visit http://localhost:${PORT} if you serve it from here)`);
});