'use strict';

var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));

// Constants

var WUNDERLIST_ACCESS_TOKEN = 'abc';
var WUNDERLIST_SHOPPING_LIST_ID = '13371337';

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

function create(task) {
  // TODO: This.
}

// Exports

module.exports.getAll = getAll;
module.exports.remove = remove;
module.exports.create = create;
