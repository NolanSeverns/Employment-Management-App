// Load environment variables
require('dotenv').config({ path: './backend/.env' }); // Adjust the path as necessary

// Log the loaded environment variables
console.log('Loaded environment variables:');
console.log(process.env);

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./db'); // Import the pool from db.js
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// Security configurations
app.use(helmet()); // Set security-related HTTP response headers
app.use(express.json()); // Middleware to parse JSON bodies

// Logging middleware for HTTP requests
app.use(morgan('dev')); // 'dev' format provides colored output

// Rate limiting to prevent brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
});
app.use(limiter);

console.log(process.env.SESSION_SECRET);

// Session middleware
console.log('Session secret:', process.env.SESSION_SECRET); // Add this line
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport local strategy for authentication
passport.use(
  new LocalStrategy({ usernameField: 'employeeId' }, async (employeeId, password, done) => {
    try {
      const user = await pool.query('SELECT * FROM public.employees WHERE id = $1', [employeeId]);
      // Rest of the code...
    } catch (error) {
      return done(error);
    }
  })
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.employee_id);
});

// Deserialize user from session
passport.deserializeUser(async (employeeId, done) => {
  try {
    const user = await pool.query('SELECT * FROM public.employees WHERE employee_id = $1', [employeeId]);
    if (user.rows.length === 0) {
      return done(new Error('User not found'));
    }
    done(null, user.rows[0]);
  } catch (error) {
    done(error);
  }
});

// Ensures the database connection is live when starting the server
async function connectDB() {
  try {
    await pool.query('SELECT 1'); // Simple query to test connectivity
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Error connecting to PostgreSQL database:', error);
    process.exit(1);
  }
}

// Middleware to ensure authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Middleware to check user roles
function checkRole(role) {
  return (req, res, next) => {
    if (req.isAuthenticated() && req.user && req.user.role === role) {
      return next();
    }
    res.status(403).send('Forbidden');
  };
}

// Route handler to get all employees (Only accessible to admins and managers)
app.get('/employees', checkRole('admin'), async (req, res) => {
  try {
    const employees = await pool.query('SELECT * FROM public.employees');
    res.json(employees.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Route handler to get employee by ID (Accessible to admins, managers, and employees)
app.get('/employees/:id', async (req, res) => {
  const employeeId = parseInt(req.params.id);
  if (isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee ID' });
  }

  try {
    const employee = await pool.query('SELECT * FROM public.employees WHERE id = $1', [employeeId]);
    if (employee.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
    } else {
      // Only allow admins and managers to access other employees' data
      if (req.isAuthenticated() && req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
        res.json(employee.rows[0]);
      } else if (req.isAuthenticated() && req.user && req.user.employee_id === employeeId) {
        // Allow employees to access their own data
        res.json(employee.rows[0]);
      } else {
        res.status(403).send('Forbidden');
      }
    }
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Route handler to reset passwords (Only accessible to admins)
app.post('/reset-password', checkRole('admin'), async (req, res) => {
  const { employeeId, newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE public.employees SET password = $1 WHERE employee_id = $2', [hashedPassword, employeeId]);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Route handler to protect routes (Only accessible to authenticated users)
app.get('/protected', ensureAuthenticated, (req, res) => {
  res.send('You are authenticated!');
});

// Route handler for user login
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      return res.status(200).json({ message: 'Login successful', user: req.user });
    });
  })(req, res, next);
});

// Route handler for handling POST requests to /employees/:id
app.post('/employees/:id', (req, res) => {
  res.status(404).send('Not found');
});

// Gracefully close the pool when the application is terminated
process.on('SIGINT', async () => {
  console.log('Closing database connection pool...');
  await pool.end();
  console.log('Database connection pool closed.');
  process.exit(0);
});

// Start the server and connect to the database
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
