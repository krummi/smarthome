'use strict';

const express = require('express');
const router = express.Router();
const _ = require('lodash');

const knex = require('../repositories/knex');
const wunderlist = require('../repositories/wunderlist');

// Routes

router.get('/products', (req, res, next) => {
  knex('Products').select('*')
  .then(rows => {
    res.render('products/index', { products: rows });
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

// TODO: This should be authenticated somehow

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
