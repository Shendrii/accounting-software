import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import accountsRouter from './routes/accounts.js';
import journalEntriesRouter from './routes/journalEntries.js';
import receiptsRouter from './routes/receipts.js';
import dashboardRouter from './routes/dashboard.js';
import customersRouter from './routes/customers.js';
import vendorsRouter from './routes/vendors.js';
import invoicesRouter from './routes/invoices.js';
import billsRouter from './routes/bills.js';
import reconciliationRouter from './routes/reconciliation.js';
import reportsRouter from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Accounting API!' });
});

app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

// API Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/journal-entries', journalEntriesRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/customers', customersRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/bills', billsRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/reports', reportsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;
