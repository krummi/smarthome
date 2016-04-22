'use strict';

const conf = require('node-oz-helpers').getConf();

// Set up database connection.
const knex = require('knex')({
  client: 'postgres',
  connection: conf.get('DATABASE_URL')
});

// Exports

module.exports = knex;
