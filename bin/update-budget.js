'use strict';

const redis = require('redis');
const co = require('co');
const bluebird = require('bluebird');
const MenigaClient = require('meniga');
const _ = require('lodash');
const moment = require('moment');

const conf = require('node-oz-helpers').getConf();

const redisClient = redis.createClient(conf.get('REDIS_URL'));
bluebird.promisifyAll(redisClient);
redisClient.unref();

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
        MaxTopMerchants: 10,
        IncludeSavingsInNetIncome: true,
        DateFormat: null,
        MinPieSliceValue: 1,
        MinSlicesInPie: 0,
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
    do {
      transactions = yield menigaClient.getTransactionsPage({
        filter: {
          PeriodFrom: moment('2015-10-01'),
          PeriodTo: moment('2015-11-01')
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
    console.log('transactions updated successfully?', success);

    // Find categories!
    let allCategoryIds = _.pluck(categories, 'Id');
    let report = yield menigaClient.getTrendsReport(createOptions(allCategoryIds));
    let results = _.map(report.Series.Rows, function (row) {
      let data = _.pluck(row.Columns, 'Value');
      // console.log(`${rpad(data[0], 40)}${-data[1]} kr.`);
      return { name: data[0], amount: -data[1] };
    });
    success = yield redisClient.setAsync('meniga:categories', JSON.stringify(results));
    console.log('categories updated successfully?', success);
  } catch (err) {
    console.error('got err:', err);
  }
});
