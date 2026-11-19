const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const errorHandler = require('./middlewares/errorHandler');
const rateLimiter = require('./middlewares/rateLimiter');
const authRoutes = require('./routes/v1/auth');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use(rateLimiter);

// Request logger
app.use((req, res, next) => {
  logger.info({method: req.method, url: req.url, ip: req.ip});
  next();
});

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/disputes', require('./routes/disputes'));
app.use('/api/payouts', require('./routes/payouts'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res, next) => next(Object.assign(new Error('Route not found'), { status: 404 })));
app.use(errorHandler);

module.exports = app;
