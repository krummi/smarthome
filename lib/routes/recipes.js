'use strict';

const express = require('express');
const router = express.Router();
const _ = require('lodash');
const bluebird = require('bluebird');

const wunderlist = require('../repositories/wunderlist');
const knex = require('../repositories/knex');

router.get('/recipes', (req, res, next) => {
  const query = knex('Recipes').select('*').orderBy('title');
  if (req.query.tag) {
    query.where(knex.raw('? = ANY(tags)', req.query.tag));
  }
  query.then(function (results) {
    res.render('recipes/index', { recipes: results });
  });
});

// TODO: MOVE TO THE "RECIPE MODEL"!
function findUsedTags() {
  return knex('Recipes').select('tags')
  .then(function (results) {
    const usedTags = new Set();
    results.map(tags => {
      tags.tags.map(tag => usedTags.add(tag));
    });
    usedTags.delete('');
    return Array.from(usedTags);
  });
}

router.get('/recipes/new', (req, res, next) => {
  findUsedTags()
  .then(function (tags) {
    res.render('recipes/_form.jade', { recipe: { ingredients: [] }, tags: tags });
  });
});

router.get('/recipes/:id/edit', (req, res, next) => {
  bluebird.props({
    usedTags: findUsedTags(),
    recipes: knex('Recipes').select('*').where({ id: req.params.id })
  })
  .then(function (r) {
    res.render('recipes/_form.jade', { recipe: _.first(r.recipes), tags: r.usedTags });
  });
});

router.post('/recipes/:id/edit', (req, res, next) => {
  knex('Recipes')
  .where({ id: req.params.id })
  .update({
    title: req.body.title,
    bodyHtml: req.body.bodyHtml,
    tags: req.body.tags.split(','),
    ingredients: req.body.ingredients,
    updatedAt: 'NOW()'
  })
  .then(() => {
    res.redirect('/recipes/' + req.params.id);
  });
});

router.post('/recipes/:id/buy', (req, res, next) => {
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

router.post('/recipes/new', (req, res, next) => {
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
  .then(() => {
    res.redirect('/recipes/' + newId);
  });
});

router.get('/recipes/:id', (req, res, next) => {
  knex('Recipes').select('*').where({ id: req.params.id })
  .then(results => {
    res.render('recipes/show', { recipe: _.first(results) });
  });
});

// Exports

module.exports = router;
