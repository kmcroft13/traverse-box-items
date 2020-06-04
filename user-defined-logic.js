const app = require('./src');
const { helpers, logger, csv, userCache } = app;

/**
 * A function called on every Box item processed by traverse-box-items.js where custom business logic can be implemented
 * @param  {String} ownerId Box user ID of the user who owns the Box item
 * @param  {Object} itemObj Box item object (folder, file, web_link)
 * @param  {String} parentExecutionID Unique ID associated with the execution loop which called initiated this iteration
 * @return {None}   Nothing returned by this function
 */
async function performUserDefinedActions(ownerId, itemObj, parentExecutionID) { 
    //Generate unique executionID for this loop
    const executionID = helpers.generateExecutionId();
    //Initialize variables for user object, user API client, and user task queue
    //Box API client for the user who owns the item
    const client = userCache.getUser(ownerId).client;
    //Box user object for the user who owns the item
    const clientUserObj = userCache.getUser(ownerId).info;
    //An instance of the queue for the user who owns the item
    //This is useful for scenarios where processing was incomplete and an item needs to be re-added to the queue, such as rate limiting
    const queue = userCache.getUser(ownerId).queue;

    logger.log.info({
        label: "performUserDefinedActions",
        action: "PREPARE_USER_DEFINED_ACTIONS",
        executionId: `${executionID} | Parent: ${parentExecutionID}`,
        message: `Performing user defined actions for ${itemObj.type} "${itemObj.id}" | Queue ${clientUserObj.id} size: ${queue.size}`
    });

    //[OPTIONAL] Take action on ALL OBJECTS here
    if(helpers.loadConfigs().modifyData) {
        //ACTUALLY MODIFY DATA

    } else {
        //PERFORM LOGGING FOR SIMULATION

    }
    
    if(itemObj.type === "folder") {
        //[OPTIONAL] Take additional action on FOLDER OBJECTS ONLY here

        if(helpers.loadConfigs().modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
            
        }
    } else if(itemObj.type === "file") {
        //[OPTIONAL] Take additional action on FILE OBJECTS ONLY here

        if(helpers.loadConfigs().modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
        }
    } else if(itemObj.type === "web_link") {
        //[OPTIONAL] Take additional action on ALL NON FILE OR FOLDER OBJECTS here

        if(helpers.loadConfigs().modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
        }
    } else {
        //With the current Box API, this block will never get called because no other object types exist
    }

    return;
}

module.exports = { performUserDefinedActions };
