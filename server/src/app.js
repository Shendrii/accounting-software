import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import accountsRouter from './routes/accounts.js';
import journalEntriesRouter from './routes/journalEntries.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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