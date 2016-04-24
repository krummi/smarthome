'use strict';

const express = require('express');
const router = express.Router();
const _ = require('lodash');

const knex = require('../repositories/knex');

// Middlewares

router.get('/products', (req, res, next) => {
  knex('Products').select('*')
  .then(rows => {
    res.render('products/index', { products: rows, user: req.user });
  });
});

router.post('/products/new', (req, res, next) => {
  if (!_.has(req.body, 'title') || !_.has(req.body, 'barcode')) {
    return res.redirect('/products');
  }
  knex
  .insert({ id: uuid.v4(), title: req.body.title, barcode: req.body.barcode })
  .into('Products')
  .then(() => {
    res.redirect('/products');
  });
});

// Exports

module.exports = router;
