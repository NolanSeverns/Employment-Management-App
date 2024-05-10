require('dotenv').config();
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';  // Detect if the environment is production

// Pool configuration with enhanced options and conditional SSL
const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: isProduction ? {
        rejectUnauthorized: true // Ensure SSL connections in production for security
    } : false,
    max: 1000, // Set the maximum number of clients in the pool
    idleTimeoutMillis: 60000, // Close idle clients after 60 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
});

// Global error listener on the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);  // Terminate the process in case of a connection pool error
});

module.exports = pool;
