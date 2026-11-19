// src/controllers/adminController.js
/** Admin Controller – thin wrappers around adminService */
const adminService = require('../services/adminService');

exports.freezeUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const result = await adminService.freezeUser(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.unfreezeUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const result = await adminService.unfreezeUser(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.reviewVendor = async (req, res, next) => {
  try {
    const vendorId = req.params.id;
    const { status } = req.body; // APPROVED or REJECTED
    const reviewedBy = req.user.sub;
    const result = await adminService.reviewVendor({ vendorId, status, reviewedBy });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.inspectLedger = async (req, res, next) => {
  try {
    const result = await adminService.inspectLedger();
    res.json(result);
  } catch (err) {
    next(err);
  }
};
