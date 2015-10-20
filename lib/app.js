'use strict';

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var log = require('node-oz-helpers').getLogger();
var conf = require('node-oz-helpers').getConf();
var _ = require('lodash');
var uuid = require('uuid');
let passport = require('passport');
let session = require('express-session');
let RedisStore = require('connect-redis')(session);
let bluebird = require('bluebird');

var wunderlist = require('./repositories/wunderlist');

// Set up database connection.
var knex = require('knex')({
  client: 'postgres',
  connection: conf.get('DATABASE_URL')
});

var app = express();
var Strategy = require('passport-local').Strategy;

// view engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'jade');

// parser setup
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

// passport & session setup
let options = {
  url: conf.get('REDIS_URL')
};
app.use(session({
  store: new RedisStore(options),
  secret: 'cool is nice',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

let ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

// Routing

app.get('/',
  ensureLoggedIn(),
  function (req, res, next) {
    var tasks = wunderlist.getAll();
    res.render('index', { tasks: tasks, user: req.user });
  });

// =====
// LOGIN
// =====

// Configure the local strategy for use by Passport.
//
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which
// will be set at `req.user` in route handlers after authentication.
passport.use(new Strategy(
  function (username, password, cb) {
    if (username !== conf.get('LOGIN_USERNAME') || password !== conf.get('LOGIN_PASSWORD')) {
      return cb(null, false);
    }
    return cb(null, 'krummi');
  }));

// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function (user, cb) {
  cb(null, user);
});
passport.deserializeUser(function(user, cb) {
  var user = {
    username: 'krummi',
    name: 'Hrafn Eiríksson'
  };
  return cb(null, user);
});

app.get('/login', function (req, res, next) {
  res.render('login', { user: req.user });
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

// ========
// PRODUCTS
// ========

app.get('/products',
  ensureLoggedIn(),
  function (req, res, next) {
    knex.raw('SELECT * FROM "Products"')
    .then(function (results) {
      res.render('products/index', { products: results.rows, user: req.user });
    });
  });

app.post('/products/new',
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

// =======
// RECIPES
// =======

app.get('/budget',
  ensureLoggedIn(),
  function (req, res, next) {
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
      categoryValues: categoryValues,
      user: req.user
    });
  });

app.get('/recipes',
  ensureLoggedIn(),
  function (req, res, next) {
    var query = knex('Recipes').select('*').orderBy('title');
    if (req.query.tag) {
      query.where(knex.raw('? = ANY(tags)', req.query.tag));
    }
    query.then(function (results) {
      res.render('recipes/index', { recipes: results, user: req.user });
    });
  });

// TODO: MOVE TO THE RECIPE MODEL!!!!!!!!
function findUsedTags() {
  return knex('Recipes').select('tags')
  .then(function (results) {
    let usedTags = new Set();
    results.map(tags => {
      tags.tags.map(tag => usedTags.add(tag));
    });
    usedTags.delete('');
    return Array.from(usedTags);
  });
}

app.get('/recipes/new',
  ensureLoggedIn(),
  function (req, res, next) {
    findUsedTags()
    .then(function (tags) {
      res.render('recipes/_form.jade', { recipe: { ingredients: [] }, user: req.user, tags: tags });
    });
  });

app.get('/recipes/:id/edit',
  ensureLoggedIn(),
  function (req, res, next) {
    bluebird.props({
      usedTags: findUsedTags(),
      recipes: knex('Recipes').select('*').where({ id: req.params.id })
    })
    .then(function (r) {
      res.render('recipes/_form.jade', { recipe: _.first(r.recipes), user: req.user, tags: r.usedTags });
    });
  });

app.post('/recipes/:id/edit',
  ensureLoggedIn(),
  function (req, res, next) {
    knex('Recipes')
    .where({ id: req.params.id })
    .update({
      title: req.body.title,
      bodyHtml: req.body.bodyHtml,
      tags: req.body.tags.split(','),
      ingredients: req.body.ingredients,
      updatedAt: 'NOW()'
    })
    .then(function () {
      res.redirect('/recipes/' + req.params.id);
    });
  });

app.post('/recipes/:id/buy',
  function (req, res, next) {
    knex('Recipes').select('ingredients').where({ id: req.params.id })
    .then(function (results) {
      if (results.length === 0) {
        res.send(404).end();
      }
      let ingredients = results[0].ingredients;
      let items = [];
      if (_.isArray(ingredients)) {
        _.forEach(ingredients, i => items.push(`${i.quantity} ${i.unit} ${i.item}`.trim()));
      } else {
        _.forEach(_.values(ingredients), group => {
          _.forEach(group, i => items.push(`${i.quantity} ${i.unit} ${i.item}`.trim()));
        });
      }
      return bluebird.all(_.map(items, wunderlist.create));
    })
    .then(function (wunderlistResults) {
      console.log(wunderlistResults);
      res.status(201).end();
    });
  });

app.post('/recipes/new',
  ensureLoggedIn(),
  function (req, res, next) {
    let newId = uuid.v4();
    knex('Recipes')
    .insert({
      id: newId,
      title: req.body.title,
      bodyHtml: req.body.bodyHtml,
      tags: req.body.tags.split(','),
      ingredients: req.body.ingredients,
      createdAt: 'NOW()',
      updatedAt: 'NOW()'
    })
    .then(function () {
      res.redirect('/recipes/' + newId);
    });
  });

app.get('/recipes/:id',
  ensureLoggedIn(),
  function (req, res, next) {
    knex('Recipes').select('*').where({ id: req.params.id })
    .then(function (results) {
      res.render('recipes/show', { recipe: _.first(results), user: req.user });
    });
  });

app.post('/add-to-shopping-cart',
  function (req, res, next) {
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
