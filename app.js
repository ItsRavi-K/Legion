const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { z } = require('zod');
const NodeCache = require('node-cache');

const app = express();
const logger = pino({ level: 'info' });

// Middleware
app.use(express.json());
app.use(pinoHttp({ logger }));

// Simple in-memory cache
const cache = new NodeCache({ stdTTL: 30 });

// Metrics (basic)
let requestCount = 0;
let errorCount = 0;

// Rate limiter (simple)
const rateLimitMap = new Map();
const RATE_LIMIT = 10;

function rateLimiter(req, res, next) {
  const ip = req.ip;
  const count = rateLimitMap.get(ip) || 0;

  if (count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  rateLimitMap.set(ip, count + 1);
  setTimeout(() => rateLimitMap.set(ip, count), 60000);

  next();
}

app.use(rateLimiter);

// Validation schema
const orderSchema = z.object({
  item: z.string(),
  quantity: z.number().min(1)
});

// Fake async queue
const jobQueue = [];
function processQueue() {
  setInterval(() => {
    if (jobQueue.length > 0) {
      const job = jobQueue.shift();
      logger.info(`Processing job: ${JSON.stringify(job)}`);
    }
  }, 2000);
}
processQueue();

// Routes
app.get('/', (req, res) => {
  requestCount++;
  res.send('🚀 Legion Backend Running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', (req, res) => {
  // simulate readiness check
  res.status(200).json({ ready: true });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP legion_requests_total Total requests
legion_requests_total ${requestCount}

# HELP legion_errors_total Total errors
legion_errors_total ${errorCount}
  `);
});

app.get('/product/:id', (req, res) => {
  requestCount++;
  const { id } = req.params;

  // Cache check
  if (cache.has(id)) {
    return res.json({ source: 'cache', data: cache.get(id) });
  }

  // Simulated DB fetch
  const data = { id, name: `Product-${id}`, price: Math.random() * 100 };
  cache.set(id, data);

  res.json({ source: 'db', data });
});

app.post('/order', (req, res, next) => {
  try {
    requestCount++;
    const parsed = orderSchema.parse(req.body);

    // Push to queue
    jobQueue.push(parsed);

    res.status(202).json({ message: 'Order accepted', jobQueueLength: jobQueue.length });
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err, req, res, next) => {
  errorCount++;
  logger.error(err);

  res.status(400).json({
    error: err.message || 'Something went wrong'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Legion running on port ${PORT}`);
});
