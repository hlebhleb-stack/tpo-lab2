const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3002;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'library-secret-key',
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
  res.json({ success: true });
});

app.post('/api/register', (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !password || !full_name)
    return res.json({ success: false, error: 'Заполните все поля' });
  if (username.length < 3)
    return res.json({ success: false, error: 'Логин должен содержать не менее 3 символов' });
  if (password.length < 4)
    return res.json({ success: false, error: 'Пароль должен содержать не менее 4 символов' });
  const exists = db.get('users').find({ username }).value();
  if (exists) return res.json({ success: false, error: 'Пользователь с таким логином уже существует' });
  const id = nextId('users');
  db.get('users').push({ id, username, password, full_name }).write();
  req.session.userId = id;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.get('users').find({ id: req.session.userId }).pick(['id', 'username', 'full_name']).value();
  res.json(user);
});

// Books / Search
app.get('/api/books', (req, res) => {
  const q = (req.query.q || '').trim();

  if (q === '' && req.query.q !== undefined) {
    return res.json({ error: 'search_empty', message: 'Введите название книги или имя автора для поиска' });
  }
  if (q.length === 1) {
    return res.json({ error: 'search_too_short', message: 'Запрос слишком короткий. Введите не менее 2 символов' });
  }

  // Check if query is only whitespace
  if (req.query.q !== undefined && q === '' && req.query.q.trim() !== req.query.q) {
    return res.json({ error: 'search_empty', message: 'Введите название книги или имя автора для поиска' });
  }

  let books = db.get('books').value();

  if (q.length >= 2) {
    const lower = q.toLowerCase();
    books = books.filter(b =>
      b.title.toLowerCase().includes(lower) ||
      b.author.toLowerCase().includes(lower)
    );
  }

  res.json({ books });
});

// Orders
app.post('/api/orders', requireAuth, (req, res) => {
  const { book_id } = req.body;
  const bookId = parseInt(book_id);
  const book = db.get('books').find({ id: bookId }).value();

  if (!book) return res.json({ success: false, error: 'Книга не найдена' });
  if (book.available === 0) return res.json({ success: false, error: 'Данная книга сейчас недоступна. Все экземпляры выданы. Вы можете встать в очередь ожидания.' });

  const existing = db.get('orders').find({ user_id: req.session.userId, book_id: bookId, status: 'active' }).value();
  if (existing) return res.json({ success: false, error: 'Вы уже оформили заявку на эту книгу. Дождитесь её выдачи.' });

  const id = nextId('orders');
  db.get('orders').push({
    id, user_id: req.session.userId, book_id: bookId,
    status: 'active', ordered_at: new Date().toISOString()
  }).write();
  db.get('books').find({ id: bookId }).assign({ available: book.available - 1 }).write();

  res.json({ success: true, message: 'Ваша заявка принята. Книга будет готова к выдаче в течение 1 рабочего дня.' });
});

app.get('/api/orders', requireAuth, (req, res) => {
  const books = db.get('books').value();
  const orders = db.get('orders')
    .filter({ user_id: req.session.userId })
    .map(o => {
      const b = books.find(b => b.id === o.book_id);
      return { ...o, title: b ? b.title : '', author: b ? b.author : '' };
    })
    .value();
  res.json(orders);
});

// Debts (overdue loans)
app.get('/api/debts', requireAuth, (req, res) => {
  const now = new Date();
  const debts = db.get('loans')
    .filter(l => l.user_id === req.session.userId && l.returned_at === null)
    .map(l => {
      const due = new Date(l.due_date);
      const overdueDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
      return { ...l, overdue_days: overdueDays > 0 ? overdueDays : 0, is_overdue: overdueDays > 0 };
    })
    .value();
  res.json(debts);
});

// Cancel order
app.delete('/api/orders/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const order = db.get('orders').find({ id, user_id: req.session.userId }).value();
  if (!order) return res.json({ success: false, error: 'Заявка не найдена' });
  if (order.status !== 'active') return res.json({ success: false, error: 'Можно отменить только активную заявку' });
  const book = db.get('books').find({ id: order.book_id }).value();
  if (book) db.get('books').find({ id: order.book_id }).assign({ available: book.available + 1 }).write();
  db.get('orders').find({ id }).assign({ status: 'cancelled' }).write();
  res.json({ success: true, message: 'Заявка отменена' });
});

app.listen(PORT, () => {
  console.log(`ИС Библиотека: http://localhost:${PORT}`);
});
