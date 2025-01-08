const express = require('express');
const sql = require('mssql');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse incoming JSON requests

// Serve static files from the "dist" directory
app.use(express.static(path.join(__dirname, 'dist')));

// Database configuration
const dbConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER, // e.g., 'we-test-shared-sql-01.database.windows.net'
    database: process.env.SQL_DATABASE, // e.g., 'we-test-telephony-monitoring-sqldb-01'
    options: {
        encrypt: true, // For Azure SQL Database
        trustServerCertificate: false,
    },
};

// Test database connection
app.get('/health', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request().query('SELECT 1'); // Test query
        res.status(200).send('Database connection is healthy');
    } catch (err) {
        console.error('Database health check failed:', err.message);  // Log full error message
        res.status(500).send('Database connection failed');
    }
});

// Fetch data from the "statuses" table
app.get('/statuses', async (req, res) => {
    try {
        console.log('Fetching statuses...');
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM statuses');
        console.log('Statuses fetched:', result.recordset);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching statuses:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
        });
        res.status(500).json({
            error: 'Internal Server Error',
            details: err.message,
        });
    }
});

// Fetch data from the "status_history" table
app.get('/status_history', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM status_history');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching status history:', err.message);  // Log full error message
        res.status(500).send('Internal Server Error');
    }
});

// Catch-all route to serve the frontend (Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});