var Cache = require('../models/cache');
var User = require('../models/user');
var History = require('../models/history');
var passport = require('passport');

var dogeAPI = require('../libraries/dogeapi');
var doge = new dogeAPI();

var config = require('../config');

function auth(req, res, callback) {
    if (req.user) return callback(null, req.user);

    // TODO: more secure API key login method
    User.findOne({fbId: req.body.fbId}, function(err, user) {
        if (!err) {
            req.login(user, function(err) {
                callback(null, user);
            });
        } else {
            callback(err);
        }
    })
}

exports.cache = function(req, res) {
    // Auth user
    auth(req, res, function(err, user) {
        // First, add the cache
        Cache.addCache(user, req.body.amount, req.body.longitude, req.body.latitude, function(err, cache) {
            if (err) {
                console.log(err);
                res.send(err);
            } else {
                // Second, find caches
                var maxDistance = req.body.amount; // max search radius in meters TODO: scale the amount to the distance via function
                Cache.findCaches(user, maxDistance, req.body.longitude, req.body.latitude, function(err, caches) {
                    // Third, gather caches
                    Cache.gatherCaches(user, caches, function(err, gain) {
                        //Add a new transaction entry
                       History.addHistory(user, req.body.amount, gain, req.body.longitude, req.body.latitude, function(err, history) {
                           // Done
                           res.send(caches);
                       })


                    });
                })
            }
        });
    });
};

exports.deposit = function(req, res) {
    auth(req, res, function(err, user) {
        res.send(user.dogeAddress);
    });
};

exports.withdraw = function(req, res) {
    auth(req, res, function(err, user) {
        doge.withdrawFromUser(user.fbId, req.body.address, req.body.amount, config.dogeapiPin, function(err, result) {
            res.send(result);
        });
    });
};

exports.history = function(req, res) {
    auth(req, res, function(err, user) {
        History.getHistory(user.fbId,5, function(err, result) {
            res.send(result);
        })
    })
}