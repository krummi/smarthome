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

function createOptions(categories) {
  return {
    filter: {
      Type: 1,
      Group: 1,
      View: 1,
      Options: {
        IsParent: true,
        AccumulateCategoryExpenses: false,
        SkipInvertedCategories: true,
        GetFuture: false,
        FutureMonths: 6,
        GetAverage: false,
        ExcludeNonMappedMerchants: false,
        MaxTopMerchants: 20,
        IncludeSavingsInNetIncome: true,
        DateFormat: null,
        MinPieSliceValue: 1,
        MinSlicesInPie: 30,
        MaxSlicesInPie: 1000,
        UseAndSearchForTags: false,
        DisableSliceGrouping: false
      },
      Period: '0', // this month!
      PeriodFrom: null,
      PeriodTo: null,
      ComparisonPeriod: null,
      CategoryIds: categories,
      AccountIds: null,
      AccountIdentifiers: null,
      Merchants: null,
      Tags: null
    }
  };
}

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
      PeriodFrom: moment('2015-09-01 00:00:00'), // moment('2015-01-01 00:00:00'),
      PeriodTo: moment('2016-03-01 00:00:00'), // moment('2016-01-01 00:00:00'),
      ComparisonPeriod: null,
      CategoryIds: categories,
      AccountIds: null,
      AccountIdentifiers: null,
      Merchants: null,
      Tags: null
    }
  };
}

function isFixed(name, categoriesByName) {
  if (_.has(categoriesByName, name)) {
    return (name === 'Áskriftir og miðlun' || categoriesByName[name].IsFixedExpenses);
  } else {
    return false;
  }
}

function isFixedId(categoriesById, id) {
  if (id === 87) {
    return false;
  }
  return id === 61 || categoriesById[id].IsFixedExpenses;
}

co(function* () {
  try {
    let menigaClient = new MenigaClient();
    let authed = yield menigaClient.auth(conf.get('MENIGA_USERNAME'), conf.get('MENIGA_PASSWORD'));
    let categories = yield menigaClient.getUserCategories();

    // Find transactions!
    let categoriesByIndex = _.indexBy(categories, 'Id');
    let page = 0;
    let transactions;
    let allTransactions = [];
    let firstThisMonth = moment().startOf('month').subtract(1, 'month');
    let firstNextMonth = moment().startOf('month');
    console.log(firstThisMonth.format() + ' -> ' + firstNextMonth.format());
    do {
      transactions = yield menigaClient.getTransactionsPage({
        filter: {
          PeriodFrom: firstThisMonth,
          PeriodTo: firstNextMonth
        },
        page: page
      });
      _.forEach(transactions.Transactions, function (transaction) {
        if (_.has(categoriesByIndex, transaction.CategoryId)) {
          transaction.Category = categoriesByIndex[transaction.CategoryId];
        }
        allTransactions.push(transaction);
      });
      page++;
    } while (transactions.HasMorePages);
    let success = yield redisClient.setAsync('meniga:transactions', JSON.stringify(allTransactions));
    log.info('transactions updated successfully? ' + success);

    // VARIABLE EXPENSE BY CATEGORIES!

    let allCategoryIds = _.pluck(categories, 'Id');
    let categoriesByName = _.indexBy(categories, 'Name');
    let report = yield menigaClient.getTrendsReport(createOptions(allCategoryIds));
    let variable = [];
    let fixed    = [];
    _.map(report.Series.Rows, function (row) {
      let data = _.pluck(row.Columns, 'Value');
      let categoryName = data[0];
      if (isFixed(categoryName, categoriesByName)) {
        fixed.push({ name: data[0], amount: -data[1] });
      } else {
        variable.push({ name: data[0], amount: -data[1] });
      }
    });
    let success1 = yield redisClient.setAsync('meniga:categories:variable', JSON.stringify(variable));
    let success2 = yield redisClient.setAsync('meniga:categories:fixed', JSON.stringify(fixed));
    log.info('transactions updated successfully? ' + success1 + ' / ' + success2);

    // FIXED LAST MONTHS

    let categoriesById = _.indexBy(categories, 'Id');
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
  } catch (err) {
    log.error({ err: err }, 'got err');
  }
});
