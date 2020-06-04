//Require PQueue to control tasks
const PQueue = require('p-queue');
//Load script configs
const helpers = require('./helpers');
const config = helpers.loadConfigs();

const userCache = {};

const addUser = (userObj, userClient) => {
    if(typeof userObj !== 'object' || !userObj.id) {
        throw new Error(`userObj not provided or improperly formatted`);
    }
    if(typeof userClient !== 'object' || !userClient) {
        throw new Error(`userClient not provided or improperly formatted`);
    }
    try {
        userCache[userObj.id] = { 
            queue: new PQueue({interval: 1000, intervalCap: config.maxQueueTasksPerSecond, carryoverConcurrencyCount: false}),
            isProcessing: true,
            client: userClient,
            info: userObj
        };
    
        return userCache[userObj.id];
    } catch(err) {
        throw new Error(err);
    }
    
};

const getUser = (userId) => {
    if(typeof userId !== 'string' || !userId) {
        throw new Error(`userId not provided or improperly formatted`);
    }

    return userCache[userId];
};

const checkUser = (userId) => {
    if(typeof userId !== 'string' || !userId) {
        throw new Error(`userId not provided or improperly formatted`);
    }

    if(userCache.hasOwnProperty(userId)) {
        return true;
    } else {
        return false;
    }
};


const activeProcessingUsers = () => {
    const activeProcessingUsers = [];
    for (const [key, value] of Object.entries(userCache)) {
        if(value.isProcessing === true) {
            activeProcessingUsers.push(key);
        }
    }
    return activeProcessingUsers;
}

module.exports = { addUser, getUser, checkUser, activeProcessingUsers };
