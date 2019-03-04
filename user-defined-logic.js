////  USER DEFINED LOGIC  /////////////////////////////////////////////////
//This function is called for each file processed by traverse-box-items.js

/* performUserDefinedActions()
 * param [string] ownerId:
 * param [object] itemObj:
 * param [string] parentExecutionID: 
 * 
 * returns none
*/
async function performUserDefinedActions(ownerId, itemObj, parentExecutionID) { 
    logger.debug({
        label: "performUserDefinedActions",
        action: "PREPARE_USER_DEFINED_ACTION",
        executionId: parentExecutionID,
        message: `Preparing to perform user defined action for ${itemObj.type} "${itemObj.id}"`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)
    // Initialize variables for user object and user API client
    const client = userCache[ownerId].client;
    const clientUserObj = userCache[ownerId].info;


    //[OPTIONAL] Take action on ALL OBJECTS here
    if(config.modifyData) {
        //ACTUALLY MODIFY DATA

    } else {
        //PERFORM LOGGING FOR SIMULATION

    }
    
    if(itemObj.type === "folder") {
        //[OPTIONAL] Take additional action on FOLDER OBJECTS ONLY here

        if(config.modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
            
        }
    } else if(itemObj.type === "file") {
        //[OPTIONAL] Take additional action on FILE OBJECTS ONLY here

        if(config.modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
        }
    } else if(itemObj.type === "web_link") {
        //[OPTIONAL] Take additional action on ALL NON FILE OR FOLDER OBJECTS here

        if(config.modifyData) {
            //ACTUALLY MODIFY DATA
        } else {
            //PERFORM LOGGING FOR SIMULATION
        }
    } else {
        //With the current Box API, this block will never get called because no other object types exist
    }

    return;
}