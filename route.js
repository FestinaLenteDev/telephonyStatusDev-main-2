const sql = require('mssql');

// Load connection string from environment variables
const connectionString = process.env.SQLAZURE_CONNECTIONSTRING;

async function connectAndQuery() {
    try {
        // Create a connection pool
        const pool = await sql.connect(connectionString);

        // Query the database
        const result = await pool.request().query('SELECT * FROM statuses');
        console.log(result.recordset);

        // Close the connection
        pool.close();
    } catch (err) {
        console.error('SQL Error:', err);
    }
}

connectAndQuery();
