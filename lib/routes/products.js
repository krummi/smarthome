'use strict';

const express = require('express');
const router = express.Router();
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const _ = require('lodash');

const knex = require('../repositories/knex');

router.get('/products',
  ensureLoggedIn(),
  function (req, res, next) {
    knex('Products').select('*')
    .then(function (rows) {
      res.render('products/index', { products: rows, user: req.user });
    });
  });

router.post('/products/new',
  ensureLoggedIn(),
  function (req, res, next) {
    if (!_.has(req.body, 'title') || !_.has(req.body, 'barcode')) {
      res.redirect('/products');
    }
    knex
    .insert({ id: uuid.v4(), title: req.body.title, barcode: req.body.barcode })
    .into('Products')
    .then(function () {
      res.redirect('/products');
    });
  });

// Exports

module.exports = router;
