import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
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
import insightsRouter from './routes/insights.js';
import aiRouter from './routes/ai.js';
import recurringRouter from './routes/recurring.js';
import authRouter from './routes/auth.js';
import workspacesRouter from './routes/workspaces.js';
import workspaceSettingsRouter from './routes/workspaceSettings.js';
import { requireAuth } from './middleware/auth.js';
import { requireWorkspace } from './middleware/workspace.js';
import { withRequestContext } from './lib/requestContext.js';

dotenv.config();

const app = express();

// Behind Render/other reverse proxies, required for express-rate-limit and req.ip
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  const isProd = process.env.NODE_ENV === 'production';
  if (raw?.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (isProd) return [];
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

const corsOrigins = parseCorsOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.length === 0) {
        if (process.env.NODE_ENV === 'production') {
          console.warn('[cors] CORS_ORIGINS is empty; set it to your frontend URL(s)');
        }
        return callback(null, false);
      }
      if (corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  })
);
app.use('/api/workspace-settings/opening-balances', express.json({ limit: '4mb' }));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => withRequestContext({}, () => next()));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Accounting API!' });
});

app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

// API Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/workspaces', requireAuth, workspacesRouter);
app.use('/api/workspace-settings', requireWorkspace, workspaceSettingsRouter);
app.use('/api/accounts', requireWorkspace, accountsRouter);
app.use('/api/journal-entries', requireWorkspace, journalEntriesRouter);
app.use('/api/receipts', requireWorkspace, receiptsRouter);
app.use('/api/dashboard', requireWorkspace, dashboardRouter);
app.use('/api/customers', requireWorkspace, customersRouter);
app.use('/api/vendors', requireWorkspace, vendorsRouter);
app.use('/api/invoices', requireWorkspace, invoicesRouter);
app.use('/api/bills', requireWorkspace, billsRouter);
app.use('/api/reconciliation', requireWorkspace, reconciliationRouter);
app.use('/api/reports', requireWorkspace, reportsRouter);
app.use('/api/insights', requireWorkspace, insightsRouter);
app.use('/api/ai', requireWorkspace, aiRouter);
app.use('/api/recurring', requireWorkspace, recurringRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'This request is too large. Use CSV files under 1 MB each.' });
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
