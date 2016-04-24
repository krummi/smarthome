'use strict';

const express = require('express');
const router = express.Router();
const _ = require('lodash');

const wunderlist = require('../repositories/wunderlist');

// Routes

router.post('/add-to-shopping-cart', (req, res, next) => {
  if (!_.has(req.query, 'barcode')) {
    return res.status(400).end('barcode missing...');
  }
  wunderlist.create(req.query.barcode)
  .then(() => {
    res.status(200).end('successfully added');
  })
  .catch(err => {
    log.error({ err: err }, 'error hit when creating shopping cart item.');
    res.status(500).end('unable to add barcode, sry.');
  });
});

// Exports

module.exports = router;
