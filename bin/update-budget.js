#!/usr/bin/env node
'use strict';

const redis = require('redis');
const co = require('co');
const bluebird = require('bluebird');
const MenigaClient = require('meniga');
const _ = require('lodash');
const moment = require('moment');

const conf = require('node-oz-helpers').getConf();
const log = require('node-oz-helpers').getLogger();

const redisClient = redis.createClient(conf.get('REDIS_URL'));
bluebird.promisifyAll(redisClient);

function getOptions(categories, from, to) {
  return {
    filter: {
      Type: 1,
      Group: 1,
      View: 2,
      Options: {
        IsParent: true,
        AccumulateCategoryExpenses: false,
        SkipInvertedCategories: true,
        GetFuture: false,
        FutureMonths: 6,
        GetAverage: false,
        ExcludeNonMappedMerchants: false,
        MaxTopMerchants: 10,
        IncludeSavingsInNetIncome: true,
        DateFormat: null,
        MinPieSliceValue: 1,
        MinSlicesInPie: 0,
        MaxSlicesInPie: 1000,
        UseAndSearchForTags: false,
        DisableSliceGrouping: false
      },
      Period: 3, // '1', // '0' = this month, '1' = last month, 3 = "velja annað tímabil?"
      PeriodFrom: from,
      PeriodTo: to,
      ComparisonPeriod: null,
      CategoryIds: categories,
      AccountIds: null,
      AccountIdentifiers: null,
      Merchants: null,
      Tags: null
    }
  };
}

function isFixedCategory(category) {
  return (category.Name === 'Áskriftir og miðlun' || category.IsFixedExpenses);
}

// main():

co(function* () {
  let menigaClient = new MenigaClient();
  let authed = yield menigaClient.auth(
    conf.get('MENIGA_USERNAME'), conf.get('MENIGA_PASSWORD'));

  let categories = yield menigaClient.getUserCategories();
  let categoriesById = _.keyBy(categories, 'Id');

  let success = yield redisClient.setAsync(
    'meniga:categories', JSON.stringify(categories));

  // Use the month given via process arg, if one is supplied. Default to now.
  let now = (process.argv.length > 2 ? moment(process.argv[2]) : moment());
  let lower = now.clone().startOf('month');
  let upper = now.clone().endOf('month');

  // Collect all transactions for the given month
  log.info(`transactions for: ${lower.format()} -> ${upper.format()}`);
  let page = 0;
  let transactions;
  let all = [];
  do {
    transactions = yield menigaClient.getTransactionsPage({
      filter: { PeriodFrom: lower, PeriodTo: upper },
      page: page
    });
    _.forEach(transactions.Transactions, transaction => {
      // Attach the category to the transaction
      if (_.has(categoriesById, transaction.CategoryId)) {
        transaction.Category = categoriesById[transaction.CategoryId];
      }
      // Ignore transactions that have the tag 'omit'
      if (!_.includes(transaction.Tags, 'omit')) {
        all.push(transaction);
      }
    });
    page++;
  } while (transactions.HasMorePages);

  success = yield redisClient.setAsync(
    'meniga:transactions', JSON.stringify(all));
  log.info('transactions updated successfully? ' + success);

  // Fixed expenses previous N months

  let fixedCategoryIds = _(categories)
    .filter(isFixedCategory)
    .map('Id')
    .value();

  let periodFrom = upper.clone().add(1, 'second').subtract(6, 'months');
  let periodTo = upper.clone().add(1, 'second');
  log.info(`fixed report for: ${periodFrom.format()} -> ${periodTo.format()}`);
  let report = yield menigaClient.getTrendsReport(getOptions(
    fixedCategoryIds, periodFrom, periodTo));
  let groups = {};
  let labels = [];
  _.forEach(report.Series.Rows, row => {
    labels.push(row.Columns[0].Value);
    _.forEach(row.Columns.slice(1), cat => {
      if (!_.has(groups, cat.Name)) {
        groups[cat.Name] = [];
      }
      let value = (cat.Value === 0 ? 0 : -cat.Value);
      groups[cat.Name].push(value);
    });
  });
  let series = _(groups)
    .map((v, k) => { return { name: k, data: v, sum: _.sum(v) } })
    .sortBy('sum')
    .value();
  success = yield redisClient.setAsync('meniga:fixed',
    JSON.stringify({ series, labels }));
  log.info(`fixed by months successful? ${success}`);

  // done
  redisClient.unref();
}).catch(err => {
  log.error({ err: err }, 'got err');
});
