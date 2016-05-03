'use strict';

const express = require('express');
const router = express.Router();
const co = require('co');
const _ = require('lodash');
const moment = require('moment');
const log = require('node-oz-helpers').getLogger();

const redisClient = require('../repositories/redis');

// Routes

router.get('/budget', showDashboard);

// Internal middlewares

function showDashboard (req, res, next) {
  co(function* () {
    let planned = req.query.plan ? Number(req.query.plan) : 150000;
    let day = req.query.day ? moment(req.query.day) : moment();

    let redisResults = yield [
      redisClient.getAsync('meniga:transactions'),
      redisClient.getAsync('meniga:categories')
    ];
    let transactions = JSON.parse(redisResults[0]);
    let categories = JSON.parse(redisResults[1]);
    let categoriesByName = _.groupBy(categories, 'Name');

    let variableExpenses = _(transactions)
      .filter(t => t.Amount < 0 &&
                   t.Category.CategoryType === 'Expenses' &&
                   !isFixedCategory(t.Category));

    // Creates the 'daily burndown' graph

    let byDay = _(variableExpenses)
      .groupBy(t => moment(t.Date).date())
      .map((v, k) => {
        return {
          day: k,
          amount: -_.sumBy(v, 'Amount')
        };
      })
      .value();

    let allowancePerDay = planned / day.daysInMonth();
    let actual = planned;
    const expenses = _.map(_.range(1, day.date() + 1), i => {
      // Actual:
      let thisDay = _.find(byDay, { day: String(i) });
      if (thisDay) {
        actual -= thisDay.amount;
      }
      // Planned:
      planned -= allowancePerDay;
      return { day: i, actual: Math.round(actual), planned };
    });

    // Creates the 'variable expense by category' graph

    let byCategory = _(variableExpenses)
      .groupBy(t => t.Category.Name)
      .map((v, k) => {
        return {
          name: k,
          amount: -_.sumBy(v, 'Amount')
        };
      })
      .sortBy(v => -v.amount)
      .value();

    // By categories
    let categoryNames = _.map(byCategory, 'name');
    let categoryValues = _.map(byCategory, 'amount');
    let total = _.sum(categoryValues);

    let fixedStr = yield redisClient.getAsync('meniga:fixed');
    let fixed = JSON.parse(fixedStr);

    res.render('budget/index', {
      year: day.year(),
      month: day.month(),
      expenses: expenses,
      categoryNames: categoryNames,
      categoryValues: categoryValues,
      fixed: fixed,
      total: total
    });
  })
  .catch(err => {
    console.log(err);
    res.render('error', { error: err });
    throw err;
  });
}

// Helpers

function isFixedCategory(category) {
  return (category.Name === 'Áskriftir og miðlun' || category.IsFixedExpenses);
}

// Exports

module.exports = router;
