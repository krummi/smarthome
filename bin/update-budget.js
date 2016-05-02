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

function createOptionsNew(categories) {
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
      PeriodFrom: moment('2015-11-01 00:00:00'), // moment('2015-01-01 00:00:00'),
      PeriodTo: moment('2016-05-01 00:00:00'), // moment('2016-01-01 00:00:00'),
      ComparisonPeriod: null,
      CategoryIds: categories,
      AccountIds: null,
      AccountIdentifiers: null,
      Merchants: null,
      Tags: null
    }
  };
}

function isFixedId(categoriesById, id) {
  if (id === 87) {
    return false;
  }
  return id === 61 || categoriesById[id].IsFixedExpenses;
}

// main():

co(function* () {
  let menigaClient = new MenigaClient();
  let authed = yield menigaClient.auth(
    conf.get('MENIGA_USERNAME'), conf.get('MENIGA_PASSWORD'));

  let categories = yield menigaClient.getUserCategories();
  let categoriesByIndex = _.keyBy(categories, 'Id');
  let categoriesByName = _.keyBy(categories, 'Name');

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
      if (_.has(categoriesByIndex, transaction.CategoryId)) {
        transaction.Category = categoriesByIndex[transaction.CategoryId];
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

  // FIXED LAST MONTHS

  let categoriesById = _.keyBy(categories, 'Id');
  let fixedCategoryIds = _.filter(allCategoryIds, _.partial(isFixedId, categoriesById));
  let things = yield menigaClient.getTrendsReport(createOptionsNew(fixedCategoryIds));
  let groups = {};
  let xAxis = [];
  _.forEach(things.Series.Rows, row => {
    let info = row.Columns[0];
    xAxis.push(info.Value);
    let slices = row.Columns.slice(1);
    _.forEach(slices, slice => {
      if (!_.has(groups, slice.Name)) {
        groups[slice.Name] = [];
      }
      let value = (slice.Value === 0 ? 0 : -slice.Value);
      groups[slice.Name].push(value);
    });
  });
  let transformed = _.map(groups, (value, key) => {
    return { name: key, data: value, sum: _.sum(value) };
  });
  transformed = _.sortBy(transformed, 'sum');
  success = yield redisClient.setAsync('meniga:fixed', JSON.stringify({ g: transformed, x: xAxis }));
  log.info('transactions updated successfully? ' + success1 + ' / ' + success);

  redisClient.unref();
}).catch(err => {
  log.error({ err: err }, 'got err');
});
