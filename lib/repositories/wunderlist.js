'use strict';

var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var _ = require('lodash');
var log = require('node-oz-helpers').getLogger();
var conf = require('node-oz-helpers').getConf();

// Constants

var WUNDERLIST_CREATE_TASK_URL = 'https://a.wunderlist.com/api/v1/tasks';

// Functions

function getAll(listId) {
  // TODO: This.
  return [
    {
      id: '1337',
      title: 'Coco Puffs - lítill'
    },
    {
      id: '1338',
      title: '1L léttmjólk'
    },
    {
      id: '1339',
      title: '1/2L rjómi'
    }
  ];
}

function remove(taskId) {
  // TODO: This.
}

function create(productName) {
  var params = {
    url: WUNDERLIST_CREATE_TASK_URL,
    json: true,
    headers: {
      'X-Access-Token': conf.get('WUNDERLIST_ACCESS_TOKEN'),
      'X-Client-ID': conf.get('WUNDERLIST_CLIENT_ID')
    },
    body: {
      list_id: Number(conf.get('WUNDERLIST_SHOPPING_CART_LIST_ID')),
      title: productName
    }
  };
  return request.postAsync(params)
    .spread(function (res, body) {
      log.info('wunderlist status:', res.statusCode);
      log.info('wunderlist body:  ', body);
      if (res.statusCode >= 300) {
        throw new Error('>=300 status from Wunderlist, body:' + JSON.stringify(body));
      }
      return true;
    });
}

// Exports

module.exports.getAll = getAll;
module.exports.remove = remove;
module.exports.create = create;
