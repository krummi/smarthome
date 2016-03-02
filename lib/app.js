'use strict';

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const log = require('node-oz-helpers').getLogger();
const conf = require('node-oz-helpers').getConf();
const _ = require('lodash');
const uuid = require('uuid');
const passport = require('passport');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const bluebird = require('bluebird');
const redis = require('redis');
const co = require('co');

const wunderlist = require('./repositories/wunderlist');

const redisOptions = {
  url: conf.get('REDIS_URL')
};

const redisClient = redis.createClient(conf.get('REDIS_URL'));
bluebird.promisifyAll(redisClient);
redisClient.unref();

// Set up database connection.
const knex = require('knex')({
  client: 'postgres',
  connection: conf.get('DATABASE_URL')
});

const app = express();
const Strategy = require('passport-local').Strategy;

// view engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'jade');

// parser setup
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

// passport & session setup
app.use(session({
  store: new RedisStore(redisOptions),
  secret: 'cool is nice',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

// Routing

app.get('/',
  ensureLoggedIn(),
  function (req, res, next) {
    const tasks = wunderlist.getAll();
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
  const userObj = {
    username: 'krummi',
    name: 'Hrafn Eiríksson'
  };
  return cb(null, userObj);
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

app.get('/budget',
  ensureLoggedIn(),
  function (req, res, next) {
    co(function* () {
      try {
      const moment = require('moment');
      const fs = require('fs');

      // Actual
      const transactionsStr = yield redisClient.getAsync('meniga:transactions');
      const transactions = JSON.parse(transactionsStr);
      const onlyExpenseTransactions = _.filter(transactions, t => !t.Category.IsFixedExpenses && t.Category.CategoryType === 'Expenses');
      const grouped = _.groupBy(onlyExpenseTransactions, t => moment(t.Date).date());
      const sumByDay = {};
      _.forEach(grouped, function (value, key) {
        const sum = _.sum(_.pluck(value, 'Amount'));
        sumByDay[key] = -sum;
      });

      const planned = 200000;
      const dayOfMonth = moment.utc().date();

      // Actual
      let n = planned;
      const actualExpenses = _.map(_.range(1, dayOfMonth + 1), i => {
        if (_.has(sumByDay, i)) {
          n -= sumByDay[i];
        }
        return { day: i, amount: n };
      });

      // Planned
      const plannedExpensePerDay = planned / moment.utc().daysInMonth();
      n = planned;
      const plannedExpenses = _.map(_.range(1, dayOfMonth + 1), function (i) {
        n -= plannedExpensePerDay;
        return { day: i, amount: n };
      });

      // By categories
      const categoriesStr = yield redisClient.getAsync('meniga:categories:variable');
      const categories = JSON.parse(categoriesStr);
      const categoryNames = _.pluck(categories, 'name');
      const categoryValues = _.pluck(categories, 'amount');
      const total = _.sum(categoryValues);

      const fixedStr = yield redisClient.getAsync('meniga:fixed');
      const fixed = JSON.parse(fixedStr);
      console.log(fixed);

      res.render('budget/index', {
        expensesByDay: actualExpenses,
        plannedExpenses: plannedExpenses,
        categoryNames: categoryNames,
        categoryValues: categoryValues,
        fixed: fixed,
        total: total,
        user: req.user
      });
    } catch (err) {
      console.log(err);
    }
    });
  });

// =======
// RECIPES
// =======

app.get('/recipes',
  ensureLoggedIn(),
  function (req, res, next) {
    const query = knex('Recipes').select('*').orderBy('title');
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
    const usedTags = new Set();
    results.map(tags => {
      tags.tags.map(tag => usedTags.add(tag));
    });
    usedTags.deconste('');
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
      const ingredients = results[0].ingredients;
      const items = [];
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
    const newId = uuid.v4();
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
