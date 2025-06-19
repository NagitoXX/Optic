const express = require('express');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('optic.db');

const hbs = exphbs.create({
  helpers: {
    multiply: (a, b) => a * b
  }
});

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

// Initialize DB
function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );`);
    db.run(`CREATE TABLE IF NOT EXISTS frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      reference TEXT,
      quantity INTEGER,
      unit_price REAL,
      sold INTEGER DEFAULT 0,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );`);
  });
}

initDb();

// Routes
app.get('/', (req, res) => {
  db.all('SELECT * FROM suppliers', [], (err, suppliers) => {
    if (err) return res.status(500).send('DB Error');
    res.render('suppliers', { suppliers });
  });
});

app.post('/supplier', (req, res) => {
  const { name } = req.body;
  db.run('INSERT INTO suppliers(name) VALUES(?)', [name], err => {
    if (err) return res.status(500).send('DB Error');
    res.redirect('/');
  });
});

app.get('/supplier/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, supplier) => {
    if (err || !supplier) return res.status(404).send('Not found');
    db.all('SELECT * FROM frames WHERE supplier_id = ?', [id], (err2, frames) => {
      if (err2) return res.status(500).send('DB Error');
      const totals = frames.reduce((acc, f) => {
        acc.soldValue += f.sold * f.unit_price;
        acc.remainingValue += f.quantity * f.unit_price;
        acc.soldQty += f.sold;
        acc.remainingQty += f.quantity;
        return acc;
      }, { soldValue: 0, remainingValue: 0, soldQty: 0, remainingQty: 0 });

      res.render('frames', {
        supplier,
        frames,
        totalSold: totals.soldValue,
        totalRemaining: totals.remainingValue,
        soldQty: totals.soldQty,
        remainingQty: totals.remainingQty
      });
    });
  });
});

app.post('/supplier/:id/frame', (req, res) => {
  const { reference, quantity, unit_price } = req.body;
  db.run('INSERT INTO frames(supplier_id, reference, quantity, unit_price) VALUES(?,?,?,?)',
    [req.params.id, reference, quantity, unit_price], err => {
      if (err) return res.status(500).send('DB Error');
      res.redirect(`/supplier/${req.params.id}`);
    });
});

app.post('/frame/:id/sold', (req, res) => {
  const sold = parseInt(req.body.sold, 10) || 0;
  if (sold <= 0) return res.redirect('back');

  db.get('SELECT quantity, supplier_id FROM frames WHERE id = ?', [req.params.id], (err, frame) => {
    if (err || !frame) return res.status(500).send('DB Error');
    const newQty = Math.max(frame.quantity - sold, 0);
    db.run('UPDATE frames SET sold = sold + ?, quantity = ? WHERE id = ?', [sold, newQty, req.params.id], err2 => {
      if (err2) return res.status(500).send('DB Error');
      res.redirect(`/supplier/${frame.supplier_id}`);
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
