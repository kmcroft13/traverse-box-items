//Require PQueue to control tasks
const PQueue = require('p-queue');
//Load script configs
const helpers = require('./helpers');
const config = helpers.loadConfigs();

const userCache = {};

const addUser = function(userObj, userClient) {
    if(typeof userObj !== 'object' || !userObj.id) {
        throw new Error(`userObj not provided or improperly formatted`);
    }
    if(typeof userClient !== 'object' || !userClient) {
        throw new Error(`userClient not provided or improperly formatted`);
    }
    try {
        userCache[userObj.id] = { 
            queue: new PQueue({interval: 1000, intervalCap: config.maxQueueTasksPerSecond, carryoverConcurrencyCount: false}),
            client: userClient,
            info: userObj
        };
    
        return userCache[userObj.id];
    } catch(err) {
        throw new Error(err);
    }
    
};

const getUser = function(userId) {
    if(typeof userId !== 'string' || !userId) {
        throw new Error(`userId not provided or improperly formatted`);
    }

    return userCache[userId];
};

const checkUser = function(userId) {
    if(typeof userId !== 'string' || !userId) {
        throw new Error(`userId not provided or improperly formatted`);
    }

    if(userCache.hasOwnProperty(userId)) {
        return true;
    } else {
        return false;
    }
};

module.exports = { addUser, getUser, checkUser };
