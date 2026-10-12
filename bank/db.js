const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

db.defaults({
  users: [
    { id: 1, username: 'ivanov', password: '123456', full_name: 'Иванов Алексей Петрович', account_status: 'active' },
    { id: 2, username: 'petrov', password: '123456', full_name: 'Петров Сергей Николаевич', account_status: 'blocked' },
    { id: 3, username: 'admin', password: 'admin', full_name: 'Администратор', account_status: 'active' }
  ],
  credit_applications: [
    { id: 1, user_id: 1, amount: 50000, term: 12, purpose: 'Ремонт квартиры', status: 'security_check', reject_reason: null, created_at: new Date().toISOString() },
    { id: 2, user_id: 1, amount: 200000, term: 36, purpose: 'Покупка автомобиля', status: 'rejected', reject_reason: 'Недостаточный уровень дохода', created_at: new Date().toISOString() }
  ],
  nextId: { users: 4, credit_applications: 3 }
}).write();

module.exports = db;
