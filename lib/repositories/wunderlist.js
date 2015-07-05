'use strict';

var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));

// Constants

var WUNDERLIST_ACCESS_TOKEN = 'abc';
var WUNDERLIST_SHOPPING_LIST_ID = '13371337';

// Functions

function getAllTasks(listId) {
  // TODO: This.
}

function deleteTask(taskId) {
  // TODO: This.
}

// Exports

module.exports.getAllTasks = getAllTasks;
module.exports.deleteTask = deleteTask;
