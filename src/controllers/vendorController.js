/**
 * Vendor Controller – thin wrapper around vendorService
 */
const vendorService = require('../services/vendorService');

exports.createVendor = async (req, res, next) => {
  try {
    const result = await vendorService.createVendor({ ...req.body, userUuid: req.user.sub });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.getVendor = async (req, res, next) => {
  try {
    const result = await vendorService.getVendor(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateVendor = async (req, res, next) => {
  try {
    const result = await vendorService.updateVendor(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const result = await vendorService.deleteVendor(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
