'use strict';

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

app.get('/budget', function (req, res, next) {
  let moment = require('moment');
  let fs = require('fs');

  // Actual
  let transactions = JSON.parse(fs.readFileSync('./lib/hehe.json'));
  let onlyExpenseTransactions = _.filter(transactions, t => t.Category.CategoryType === 'Expenses');
  let grouped = _.groupBy(onlyExpenseTransactions, t => moment(t.Date).date());
  let sumByDay = {};
  _.forEach(grouped, function (value, key) {
    let sum = _.sum(_.pluck(value, 'Amount'));
    sumByDay[key] = -sum;
  });

  let planned = 200000;
  let dayOfMonth = moment.utc().date();

  // Actual
  let n = planned;
  let actualExpenses = _.map(_.range(1, dayOfMonth + 1), i => {
    if (_.has(sumByDay, i)) {
      n -= sumByDay[i];
    }
    return { day: i, amount: n };
  });

  // Planned
  let plannedExpensePerDay = planned / moment.utc().daysInMonth();
  n = planned;
  let plannedExpenses = _.map(_.range(1, dayOfMonth + 1), function (i) {
    n -= plannedExpensePerDay;
    return { day: i, amount: n };
  });

  // By categories
  let categories = JSON.parse(fs.readFileSync('./lib/categories.json'));
  let categoryNames = _.pluck(categories, 'name');
  let categoryValues = _.pluck(categories, 'amount');

  res.render('budget/index', {
    expensesByDay: actualExpenses,
    plannedExpenses: plannedExpenses,
    categoryNames: categoryNames,
    categoryValues: categoryValues
  });
});

app.get('/recipes', function (req, res, next) {
  knex('Recipes').select('*').orderBy('title')
  .then(function (results) {
    res.render('recipes/index', { recipes: results });
  });
});

app.get('/recipes/new', function (req, res, next) {
  res.render('recipes/_form.jade', { recipe: { ingredientsi: [] } });
});

app.get('/recipes/:id/edit', function (req, res, next) {
  knex('Recipes').select('*').where({ id: req.params.id })
  .then(function (results) {
    res.render('recipes/_form.jade', { recipe: _.first(results) });
  });
});

app.post('/recipes/:id/edit', function (req, res, next) {
  knex('Recipes')
  .where({ id: req.params.id })
  .update({
    title: req.body.title,
    bodyHtml: req.body.bodyHtml,
    tags: req.body.tags.split(','),
    ingredients: req.body.ingredients
  })
  .then(function () {
    res.redirect('/recipes/' + req.params.id);
  });
});

app.get('/recipes/:id', function (req, res, next) {
  knex('Recipes').select('*').where({ id: req.params.id })
  .then(function (results) {
    res.render('recipes/show', { recipe: _.first(results) });
  });
});

app.post('/add-to-shopping-cart', function (req, res, next) {
  if (!_.has(req.query, 'barcode')) {
    res.status(400).end('barcode missing...');
    return;
  }
  wunderlist.create(req.query.barcode)
  .then(function (success) {
    if (success) {
      res.status(200).end('successfully added');
    } else {
      log.warn('invalid barcode:', req.query.barcode);
      res.status(400).end();
    }
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
