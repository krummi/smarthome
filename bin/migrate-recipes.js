'use strict';

var conf = require('node-oz-helpers').getConf();
var knex = require('knex');
var _ = require('lodash');
var url = require('url');
var uuid = require('uuid');

// Parse the source database URL.
var sourceDatabaseUrl = process.argv[2];
if (!sourceDatabaseUrl) {
  console.log('> you must provide a source DATABASE_URL');
  process.exit(-1);
}

function parseConnectionString(databaseUrl) {
  var parsed = url.parse(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port,
    user: parsed.auth.split(':')[0],
    password: parsed.auth.split(':')[1],
    database: parsed.path.substring(1)
  };
}

// Set up database connection to the source database
var sourceKnex = knex({
  client: 'postgres',
  connection: _.merge(parseConnectionString(sourceDatabaseUrl), { ssl: true })
});

// Set up database connection to the target database.
console.log(conf.get('DATABASE_URL'));
var targetKnex = require('knex')({
  client: 'postgres',
  connection: conf.get('DATABASE_URL')
});

sourceKnex.from('recipes').select('*')
.then(function (results) {
  var tasks = _.map(results, function (value, key) {
    return targetKnex('Recipes').insert({
      id: uuid.v4(),
      type: 'recipe',
      title: value.title,
      bodyHtml: value.description_html,
      ingredients: value.ingredients,
      tags: [],
      link: null,
      createdAt: value.created_at,
      updatedAt: value.updated_at
    });
  });
  return Promise.all(tasks);
})
.then(function () {
  console.log('done!');
});
