// src/controllers/payoutController.js
/** Payout Controller – thin wrapper around payoutService */
const payoutService = require('../services/payoutService');

exports.requestPayout = async (req, res, next) => {
  res.status(503).json({ error: 'Payouts are unavailable until a payout provider is configured' });
};

exports.getPayoutStatus = async (req, res, next) => {
  try {
    const payoutId = req.params.id;
    const result = await payoutService.getPayoutStatus(payoutId, req.user.sub, req.user.roles.includes('ADMIN'));
    res.json(result);
  } catch (err) {
    next(err);
  }
};
