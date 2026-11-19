// src/controllers/walletController.js
/** Wallet Controller – exposes wallet balances and gates unconfigured money flows. */
exports.fundWallet = async (req, res, next) => {
  res.status(503).json({ error: 'Wallet funding is unavailable until payment verification is configured' });
};

exports.getBalance = async (req, res, next) => {
  try {
    const userUuid = req.user.sub;
    // Placeholder: fetch account row directly
    const { getPool } = require('../../config/database');
    const pool = getPool();
    const result = await pool.query(
      'SELECT balance_kobo FROM accounts WHERE owner_type = $1 AND owner_id = $2 AND currency = $3',
      ['USER', userUuid, 'NGN']
    );
    const balance = result.rows[0] ? result.rows[0].balance_kobo : '0';
    res.json({ balanceKobo: balance });
  } catch (err) {
    next(err);
  }
};

exports.withdraw = async (req, res, next) => {
  res.status(503).json({ error: 'Withdrawals are unavailable until a payout provider is configured' });
};
