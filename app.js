const express = require('express');
const bcrypt = require('bcrypt');
const app = express();
const session = require('express-session');
const conn = require('./dbConfig');
app.use('/public', express.static('public'));
app.set('view engine', 'ejs');
const mysql = require('mysql2');
const path = require('path');
const { log } = require('console');

// Serve static files from 'public' folder
app.use(express.static('public'));

// Create connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',       // default XAMPP user
    password: '',       // leave blank if no password set
    database: 'task2db'  // your database name
});

// Connect
db.connect(err => {
    if (err) throw err;
    console.log('✅ MySQL Connected!');
});

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 }
}));

function isLoggedIn(req, res, next) {
    if (req.session && req.session.loggedin) {
        return next();
    }
    res.redirect('/login');
}


app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    const sql = 'SELECT * FROM products ORDER BY created_at DESC';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render("home", {
            products: results,
            session: req.session
        });
    });
});

app.get('/login', function (req, res) {
    // If user came from another page, remember it
    if (!req.session.returnTo && req.headers.referer && !req.headers.referer.includes('/login')) {
        req.session.returnTo = req.headers.referer;
    }
    res.render('login.ejs');
});

app.post('/auth/login', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    if (username && password) {
        conn.query('SELECT * FROM user WHERE username = ?', [username], function (error, results, fields) {
            if (error) {
                console.error('Database error:', error)
                return res.send('Database connection error.');
            }

            if (results.length > 0) {
                const hashedPassword = results[0].password;

                // Compare the entered password with the hashed one
                bcrypt.compare(password, hashedPassword, function (err, isMatch) {
                    if (err) {
                        console.error('Bcrypt error:', err);
                        return res.send('Error verifying password.');
                    }

                    if (isMatch) {
                        // Login success
                        req.session.loggedin = true;
                        req.session.user = {
                            id: results[0].id,        // store user id
                            username: results[0].username  // store username
                        };

                        console.log('Session after login:', req.session);

                        // Redirect back to previous page if available
                        const redirectTo = req.session.returnTo || '/';
                        delete req.session.returnTo;
                        res.redirect(redirectTo);
                    }
                    else {
                        // Wrong password
                        res.send('Incorrect Username and/or Password!');
                    }
                });
            } else {
                // No such user
                res.send('Incorrect Username and/or Password!');
            }
        });
    } else {
        res.send('Please enter Username and Password!');
    }
});

app.get('/register', function (req, res) {
    res.render('register', { session: req.session, error: null });
});

app.post('/auth', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;
    const confirmPassword = req.body.confirmPassword;

    // Check if user already exists
    conn.query('SELECT * FROM user WHERE username =?', [username], function (error, results, fields) {
        if (error) {
            console.error('Database error:', error);
            return res.render('register', { session: req.session, error: 'Error connecting to db' });
        }

        if (results.length > 0) {
            return res.render('register', { session: req.session, error: 'user already exist.' });
        }

        if (password !== confirmPassword) {
            return res.render('register', { session: req.session, error: 'Passwords do not match.' });
        }

        // Hash password before storing
        bcrypt.hash(password, 10, function (err, hashedPassword) {
            if (err) {
                console.error('Password hashing error:', err)
                return res.render('register', { session: req.session, error: 'Error creating account!' });
            }

            // Insert new user with hashed password (email can be null)
            conn.query('INSERT INTO user (username, password, email) VALUES (?, ?,?)', [username, hashedPassword, email], function (error, results, fields) {
                if (error) {
                    console.error('Database error:', error);
                    return res.render('register', { session: req.session, error: 'Error creating account!' });
                }

                // Auto-login after successful registration
                req.session.loggedin = true;
                req.session.username = username;
                res.redirect('/');
            })
        });
    })
})

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log(err);
            return res.redirect('/'); // still redirect to home on error
        }
        res.redirect('/'); // redirect to home page after logout
    });
});

app.get('/information', (req, res) => {
    const eventsQuery = 'SELECT * FROM events';
    const shopsQuery = 'SELECT * FROM shops';

    conn.query(eventsQuery, (err, events) => {
        if (err) throw err;

        conn.query(shopsQuery, (err2, shops) => {
            if (err2) throw err2;

            // 👇 send both variables to EJS
            res.render('information', { events, shops });
        });
    });
});

app.get('/community', function (req, res) {
    console.log('Session on community page:', req.session);

    if (req.session.loggedin && req.session.user) {
        res.render('community', { user: req.session.user.username });
    } else {
        res.render('community', { user: null });
    }
});

// GET Contact page
app.get('/contact', (req, res) => {
    res.render('contact'); // just render the contact page
});

// POST form submission
app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Contact form submitted:', { name, email, message });
    // You can add email sending here (nodemailer) or save to database
    res.send('Thank you for contacting us! We will get back to you soon.');
});

app.get('/shopping', (req, res) => {
    const selectedCat = req.query.cat || 'all';

    const catQuery = "SELECT * FROM categories";
    const productQuery = selectedCat === 'all'
        ? "SELECT * FROM products"
        : "SELECT * FROM products WHERE category_id = ?";

    db.query(catQuery, (err, categories) => {
        if (err) throw err;

        db.query(productQuery, [selectedCat], (err, products) => {
            if (err) throw err;

            res.render("shopping", {
                categories: categories,
                products: products
            });
        });
    });
});

app.get('/product/:id', (req, res) => {
    const productId = req.params.id;
    const sql = "SELECT * FROM products WHERE id = ?";

    db.query(sql, [productId], (err, results) => {
        if (err) return res.send("Database error");
        if (results.length === 0) return res.send("Product not found");

        // Pass the session user to EJS
        res.render('product_detail', {
            product: results[0],
            user: req.session.user ? req.session.user.username : null
        });
    });
});

app.post('/add-to-cart', function (req, res) {

    // User NOT logged in
    if (!req.session.loggedin || !req.session.user) {
        return res.status(401).json({ notLoggedIn: true });
    }

    const userId = req.session.user.id;
    const productId = req.body.id;

    // 1️⃣ Check if item already exists in cart
    const checkSql = `
        SELECT quantity 
        FROM cart 
        WHERE user_id = ? AND product_id = ?
    `;

    db.query(checkSql, [userId, productId], function (err, results) {
        if (err) {
            console.error(err);
            return res.json({ success: false });
        }

        // 2️⃣ If item exists → update quantity
        if (results.length > 0) {
            const newQty = results[0].quantity + 1;

            const updateSql = `
                UPDATE cart 
                SET quantity = ?, updated_at = NOW()
                WHERE user_id = ? AND product_id = ?
            `;

            return db.query(updateSql, [newQty, userId, productId], function (err2) {
                if (err2) {
                    console.error(err2);
                    return res.json({ success: false });
                }
                return res.json({ success: true });
            });
        }

        // 3️⃣ If item NOT in cart → insert new
        const insertSql = `
            INSERT INTO cart (user_id, product_id, quantity, created_at, updated_at)
            VALUES (?, ?, 1, NOW(), NOW())
        `;

        db.query(insertSql, [userId, productId], function (err3) {
            if (err3) {
                console.error(err3);
                return res.json({ success: false });
            }

            res.json({ success: true });
        });
    });
});


app.get('/cart', (req, res) => {

    console.log('Cart session:', req.session);  // <--- debug line

    // 1️⃣ Check if user is logged in
    if (!req.session.user) {
        return res.redirect('/not-logged-in'); // redirect to your page
    }

    const userId = req.session.user.id; // get user id from session

    const sql = `
        SELECT c.id as cart_id, p.id as product_id, p.name, p.price, p.image, c.quantity as qty
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return res.send("Database error");

        res.render('cart', {
            cart: results,
            user: req.session.user.username // pass username to EJS
        });
    });
});

app.get('/not-logged-in', (req, res) => {
    // Save the page the user came from
    req.session.returnTo = req.headers.referer || '/shopping';

    res.render('not-logged-in');
});

app.get('/check-login', (req, res) => {
    console.log("Check login route hit. Session:", req.session);

    if (req.session.loggedin) {
        res.json({ loggedin: true });
    } else {
        res.json({ loggedin: false });
    }
});

app.post('/remove-from-cart/:cartId', (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({ success: false });
  }

  const cartId = req.params.cartId;
  const userId = req.session.user.id;

  const sql = `
    DELETE FROM cart
    WHERE id = ? AND user_id = ?
  `;

  db.query(sql, [cartId, userId], (err, result) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    res.json({ success: true });
  });
});

app.post('/checkout', (req, res) => {
  if (!req.session.user) return res.redirect('/not-logged-in');

  const userId = req.session.user.id;

  // 1️⃣ Get cart items
  const cartSql = `
    SELECT c.product_id, c.quantity, p.price
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  `;

  db.query(cartSql, [userId], (err, cartItems) => {
    if (err) return res.send("Cart query error");
    if (cartItems.length === 0) return res.redirect('/cart');

    // 2️⃣ Calculate total
    let total = 10; // shipping
    cartItems.forEach(item => {
      total += item.price * item.quantity;
    });

    // 3️⃣ Insert order
    const orderSql = `
      INSERT INTO orders (user_id, total_amount, status)
      VALUES (?, ?, 'Pending')
    `;

    db.query(orderSql, [userId, total], (err, orderResult) => {
      if (err) return res.send("Order insert error");

      const orderId = orderResult.insertId;

      // 4️⃣ Insert order items
      const itemsSql = `
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES ?
      `;

      const values = cartItems.map(item => [
        orderId,
        item.product_id,
        item.quantity,
        item.price
      ]);

      db.query(itemsSql, [values], (err) => {
        if (err) return res.send("Order items insert error");

        // 5️⃣ Clear cart
        db.query(
          'DELETE FROM cart WHERE user_id = ?',
          [userId],
          () => {
            res.redirect('/checkout-success');
          }
        );
      });
    });
  });
});


app.get('/order', (req, res) => {
    if (!req.session.user) return res.redirect('/not-logged-in');

    const userId = req.session.user.id;

    // Get cart items from database
    const sql = `
        SELECT c.id as cart_id, p.id as product_id, p.name, p.price, p.image, c.quantity as qty
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.send("Database error");

        if (results.length === 0) return res.send("Cart is empty");

        // Calculate subtotal
        let subtotal = 0;
        results.forEach(item => {
            subtotal += item.price * item.qty;
        });

        res.render('order', {
            user: req.session.user,
            products: results,
            subtotal: subtotal
        });
    });
});

app.post('/buy-now', (req, res) => {
  if (!req.session.user) return res.redirect('/not-logged-in');

  const userId = req.session.user.id;
  const { product_id, quantity } = req.body;

  const checkSql = `
    SELECT id, quantity FROM cart
    WHERE user_id = ? AND product_id = ?
  `;

  db.query(checkSql, [userId, product_id], (err, rows) => {
    if (err) return res.send("DB error");

    if (rows.length > 0) {
      // already in cart → update quantity
      const updateSql = `
        UPDATE cart SET quantity = quantity + ?
        WHERE id = ?
      `;
      db.query(updateSql, [quantity, rows[0].id], () => {
        res.redirect('/order');
      });
    } else {
      // not in cart → insert
      const insertSql = `
        INSERT INTO cart (user_id, product_id, quantity)
        VALUES (?, ?, ?)
      `;
      db.query(insertSql, [userId, product_id, quantity], () => {
        res.redirect('/order');
      });
    }
  });
});

app.get('/checkout-success', (req, res) => {
  res.render('checkout-success');
});


app.listen(8888);
console.log('Node app is running on port 8888');
