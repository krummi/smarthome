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
const co = require('co');
const moment = require('moment');
const fs = require('fs');

const wunderlist = require('./repositories/wunderlist');
const redisClient = require('./repositories/redis');

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
  store: new RedisStore({ client: redisClient }),
  secret: conf.get('SESSION_SECRET'),
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Authentication TODO: Move this somewhere else

passport.use(new Strategy((username, password, cb) => {
  if (username !== conf.get('LOGIN_USERNAME') ||
      password !== conf.get('LOGIN_PASSWORD')) {
    return cb(null, false);
  }
  return cb(null, 'krummi');
}));

passport.serializeUser((user, cb) => {
  cb(null, user);
});

// TODO: Yeah - probably don't do this.
passport.deserializeUser((user, cb) => {
  const userObj = {
    username: 'krummi',
    name: 'Hrafn Eiríksson'
  };
  return cb(null, userObj);
});

// Routing

app.get('/', (req, res, next) => {
  res.redirect('/recipes');
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  });

app.get('/login', (req, res, next) => {
  res.render('login');
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.all('*', (req, res, next) => {
  if (req.isAuthenticated()) {
    res.locals.user = req.user;
    return next();
  } else {
    res.redirect('/login');
  }
});

app.use(require('./routes/budget'));
app.use(require('./routes/recipes'));
app.use(require('./routes/shopping'));

// Setup the development environment.
if (app.get('env') === 'development') {
  // Pretty print Jade.
  app.locals.pretty = true;

  // Error handling.
  app.use((err, req, res, next) => {
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
app.use((err, req, res, next) => {
  log.error({ err: err }, 'Error hit in development.');
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.set('port', process.env.PORT || 3000);

module.exports = app;
