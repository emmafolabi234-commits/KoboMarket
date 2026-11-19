const express = require('express');
const { createVendor, getVendor, updateVendor, deleteVendor } = require('../controllers/vendorController');
const authenticate = require('../middlewares/authenticate');
const rbac = require('../middlewares/rbac');

const router = express.Router();

router.post('/', authenticate, rbac(['BUYER','VENDOR','ADMIN']), createVendor);
router.get('/:id', authenticate, rbac(['BUYER','VENDOR','ADMIN']), getVendor);
router.put('/:id', authenticate, rbac(['VENDOR','ADMIN']), updateVendor);
router.delete('/:id', authenticate, rbac(['VENDOR','ADMIN']), deleteVendor);

module.exports = router;
