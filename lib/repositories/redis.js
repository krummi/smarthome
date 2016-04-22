'use strict';

const bluebird = require('bluebird');
const redis = require('redis');
const conf = require('node-oz-helpers').getConf();

const redisClient = redis.createClient(conf.get('REDIS_URL'));
bluebird.promisifyAll(redisClient);
redisClient.unref();

// Exports
module.exports = redisClient;
