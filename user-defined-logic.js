const app = require('./src');
const { helpers, logger, csv, userCache } = app;

////  USER DEFINED LOGIC  /////////////////////////////////////////////////
//This function is called for each file processed by traverse-box-items.js

/* performUserDefinedActions()
 * param [string] ownerId: User ID for the user who owns the item
 * param [object] itemObj: Object associated with the triggering file, folder, or web_link
 * param [string] parentExecutionID: Execution ID passed from the triggering function
 * 
 * returns none
*/
async function performUserDefinedActions(ownerId, itemObj, parentExecutionID) { 
    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)
    
    logger.log.debug({
        label: "performUserDefinedActions",
        action: "PREPARE_USER_DEFINED_ACTION",
        executionId: `${executionID} | Parent: ${parentExecutionID}`,
        message: `Performing user defined action for ${itemObj.type} "${itemObj.id}"`
    })

    // Initialize variables for user object, user API client, and user task queue
    const client = userCache.getUser(ownerId).client;
    const clientUserObj = userCache.getUser(ownerId).info;
    const queue = userCache.getUser(ownerId).queue;


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
