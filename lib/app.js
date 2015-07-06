var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var log = require('node-oz-helpers').getLogger();
var conf = require('node-oz-helpers').getConf();
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
  console.log(tasks);
  res.render('index', {
    tasks: tasks
  });
});

app.get('/recipes', function (req, res, next) {
  res.render('recipes/index');
});

app.get('/recipes/new', function (req, res, next) {
  res.render('recipes/new');
});

app.get('/')

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
