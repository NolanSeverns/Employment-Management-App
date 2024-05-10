require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db'); // Import the pool from db.js

const app = express();
const PORT = process.env.PORT || 3001;

// Security configurations
app.use(helmet()); // Set security-related HTTP response headers
app.use(express.json()); // Middleware to parse JSON bodies

// Rate limiting to prevent brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
});
app.use(limiter);

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

// Route handlers
async function getAllEmployees(req, res) {
  try {
    const employees = await pool.query('SELECT * FROM public.employees');
    res.json(employees.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
}

async function getEmployeeById(req, res) {
  const employeeId = parseInt(req.params.id);
  if (isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee ID' });
  }

  try {
    const employee = await pool.query('SELECT * FROM public.employees WHERE id = $1', [employeeId]);
    if (employee.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
    } else {
      res.json(employee.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
}

// Define routes
app.get('/employees', getAllEmployees);
app.get('/employees/:id', getEmployeeById);

app.post('/employees', async (req, res) => {
  const { name, email, department } = req.body;
  if (!name || !email || !department) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const { rows } = await pool.query('INSERT INTO public.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *', [name, email, department]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: 'Failed to add employee' });
  }
});

app.put('/employees/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  const { name, email, department } = req.body;
  if (!name || !email || !department) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const { rows } = await pool.query('UPDATE public.employees SET name = $1, email = $2, department = $3 WHERE id = $4 RETURNING *', [name, email, department, id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
    } else {
      res.json(rows[0]);
    }
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

app.delete('/employees/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  try {
    const { rows } = await pool.query('DELETE FROM public.employees WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
    } else {
      res.json({ message: `Employee with ID ${id} has been deleted successfully`, deletedEmployee: rows[0] });
    }
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Gracefully close the pool when application is terminated
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
