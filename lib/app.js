var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var log = require('node-oz-helpers').getLogger();
var conf = require('node-oz-helpers').getConf();
var _ = require('lodash');
var uuid = require('uuid');

var wunderlist = require('./repositories/wunderlist');

// Set up database connection.
var knex = require('knex')({
  client: 'postgres',
  connection: conf.get('DATABASE_URL')
});

var app = express();

// view engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'jade');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Routing

app.get('/', function (req, res, next) {
  log.debug('DATABASE_URL:', conf.get('DATABASE_URL'));
  // console.log(knex.select('*').from('Videos'));

  var tasks = wunderlist.getAll();
  res.render('index', {
    tasks: tasks
  });
});

// ========
// PRODUCTS
// ========

app.get('/products', function (req, res, next) {
  knex.raw('SELECT * FROM "Products"')
  .then(function (results) {
    res.render('products/index', { products: results.rows });
  });
});

app.post('/products/new', function (req, res, next) {
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

// =======
// RECIPES
// =======

app.get('/recipes', function (req, res, next) {
  res.render('recipes/index');
});

app.get('/recipes/new', function (req, res, next) {
  res.render('recipes/new', { products: products });
});

app.post('/add-to-shopping-cart', function (req, res, next) {
  if (!_.has(req.query, 'barcode')) {
    res.status(400).end('barcode missing...');
    return;
  }

  // Barcode -> product name mapping.
  var barcode = req.query.barcode;
  knex.raw('SELECT * FROM "Products" WHERE "barcode" = ?', [barcode])
  .then(function (results) {
    if (results.rows.length === 0) {
      log.warn('no product with barcode:', barcode);
      return res.status(400).end('no product with barcode: ' + barcode);
    }

    var productName = results.rows[0].title;
    wunderlist.create(productName)
    .then(function (success) {
      if (success) {
        res.status(200).end('successfully added');
      } else {
        log.warn('invalid barcode:', barcode);
        res.status(400).end();
      }
    })
  })
  .catch(function (err) {
    log.error({ err: err }, 'error hit when creating shopping cart item.');
    res.status(500).end('unable to add barcode, sry.');
  });
});

app.get('/login', function (req, res, next) {
  log.debug('COOL STUFF :D');
  res.render('login');
});

// Setup the development environment.
if (app.get('env') === 'development') {
  // Pretty print Jade.
  app.locals.pretty = true;

  // Error handling.
  app.use(function(err, req, res, next) {
    log.error({ err: err }, 'Error hit in development.');
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  log.error({ err: err }, 'Error hit in development.');
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.set('port', process.env.PORT || 3000);

module.exports = app;
