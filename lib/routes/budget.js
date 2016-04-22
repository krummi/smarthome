'use strict';

const express = require('express');
const router = express.Router();
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const co = require('co');
const _ = require('lodash');
const moment = require('moment');

const redisClient = require('../repositories/redis');

// Routes

router.get('/budget', ensureLoggedIn(), showDashboard);

// Internal middlewares

function showDashboard (req, res, next) {
  co(function* () {
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
    const dayOfMonth = 29;

    // Actual
    let n = planned;
    const actualExpenses = _.map(_.range(1, dayOfMonth + 1), i => {
      if (_.has(sumByDay, i)) {
        n -= sumByDay[i];
      }
      return { day: i, amount: Math.round(n) };
    });

    // Planned
    const plannedExpensePerDay = planned / moment().subtract(5, 'days').daysInMonth();
    n = planned;
    const plannedExpenses = _.map(_.range(1, dayOfMonth + 1), function (i) {
      n -= plannedExpensePerDay;
      return { day: i, amount: Math.round(n) };
    });

    // By categories
    const categoriesStr = yield redisClient.getAsync('meniga:categories:variable');
    const categories = JSON.parse(categoriesStr);
    const categoryNames = _.pluck(categories, 'name');
    const categoryValues = _.pluck(categories, 'amount');
    const total = _.sum(categoryValues);
    const fixedStr = yield redisClient.getAsync('meniga:fixed');
    const fixed = JSON.parse(fixedStr);

    res.render('budget/index', {
      expensesByDay: actualExpenses,
      plannedExpenses: plannedExpenses,
      categoryNames: categoryNames,
      categoryValues: categoryValues,
      fixed: fixed,
      total: total,
      user: req.user
    });
  })
  .catch(err => {
    console.log(err);
    throw err;
  });
}

// Exports

module.exports = router;
