const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'bank-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function nextId(entity) {
  const id = db.get(`nextId.${entity}`).value();
  db.set(`nextId.${entity}`, id + 1).write();
  return id;
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username, password }).value();
  if (!user) return res.json({ success: false, error: 'Неверный логин или пароль' });
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = user.username === 'admin';
  res.json({ success: true, accountStatus: user.account_status, isAdmin: user.username === 'admin' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.get('users').find({ id: req.session.userId }).pick(['id', 'username', 'full_name', 'account_status']).value();
  res.json(user);
});

// Register
app.post('/api/register', (req, res) => {
  const { username, password, full_name } = req.body;
  if (!full_name || !full_name.trim()) return res.json({ success: false, field: 'name', error: 'Введите полное имя' });
  if (!username || !username.trim()) return res.json({ success: false, field: 'username', error: 'Введите логин' });
  if (!password || password.length < 4) return res.json({ success: false, field: 'password', error: 'Пароль должен быть не менее 4 символов' });
  const exists = db.get('users').find({ username: username.trim() }).value();
  if (exists) return res.json({ success: false, field: 'username', error: 'Логин уже занят' });
  const id = nextId('users');
  db.get('users').push({ id, username: username.trim(), password, full_name: full_name.trim(), account_status: 'active' }).write();
  req.session.userId = id;
  req.session.username = username.trim();
  req.session.isAdmin = false;
  res.json({ success: true, accountStatus: 'active', isAdmin: false });
});

// Credit applications
app.post('/api/credit', requireAuth, (req, res) => {
  const user = db.get('users').find({ id: req.session.userId }).value();
  if (user.account_status === 'blocked') {
    return res.json({ success: false, error: 'Ваш счёт заблокирован. Подача кредитных заявок невозможна. Обратитесь в отделение банка.' });
  }

  const { amount, term, purpose } = req.body;
  const amountNum = parseFloat(amount);
  const termNum = parseInt(term);

  if (!amount || amount === '') return res.json({ success: false, field: 'amount', error: 'Поле «Сумма кредита» обязательно для заполнения' });
  if (!term || term === '') return res.json({ success: false, field: 'term', error: 'Поле «Срок кредита» обязательно для заполнения' });
  if (!purpose || !purpose.trim()) return res.json({ success: false, field: 'purpose', error: 'Поле «Цель кредитования» обязательно для заполнения' });
  if (amountNum < 1000) return res.json({ success: false, field: 'amount', error: 'Минимальная сумма кредита — 1 000 руб.' });
  if (amountNum > 500000) return res.json({ success: false, field: 'amount', error: 'Максимальная сумма кредита — 500 000 руб.' });
  if (termNum < 1) return res.json({ success: false, field: 'term', error: 'Минимальный срок — 1 месяц' });
  if (termNum > 360) return res.json({ success: false, field: 'term', error: 'Максимальный срок — 360 месяцев' });

  const id = nextId('credit_applications');
  const app_record = {
    id, user_id: user.id, amount: amountNum, term: termNum,
    purpose: purpose.trim(), status: 'pending', reject_reason: null,
    created_at: new Date().toISOString()
  };
  db.get('credit_applications').push(app_record).write();

  res.json({ success: true, id, message: 'Ваш запрос принят и передан на рассмотрение' });
});

app.get('/api/credit', requireAuth, (req, res) => {
  const apps = db.get('credit_applications')
    .filter({ user_id: req.session.userId })
    .sortBy(a => -new Date(a.created_at))
    .value();
  res.json(apps);
});

// Admin routes
app.get('/api/admin/applications', requireAuth, (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const users = db.get('users').value();
  const apps = db.get('credit_applications')
    .map(a => {
      const u = users.find(u => u.id === a.user_id);
      return { ...a, full_name: u ? u.full_name : '', username: u ? u.username : '' };
    })
    .sortBy(a => -new Date(a.created_at))
    .value();
  res.json(apps);
});

app.patch('/api/admin/applications/:id', requireAuth, (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const id = parseInt(req.params.id);
  const { status, reject_reason } = req.body;
  db.get('credit_applications').find({ id }).assign({ status, reject_reason: reject_reason || null }).write();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`ИС Банк: http://localhost:${PORT}`);
});
