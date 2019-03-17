////  USER DEFINED LOGIC  /////////////////////////////////////////////////

/* IMPORTANT
 * Must add the following configuration options in 
 * the `userDefinedConfigs` object in config.json:
 *    - matchSharedLinkAccessLevel: Access level you want to act upon
 *    - newSharedLinkAccessLevel: Access level to change to
 * (options are "open", "company", "collaborators")
*/

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
        message: `Performing user defined action for ${itemObj.type} "${itemObj.id}"`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)
    // Initialize variables for user object and user API client
    const client = userCache[ownerId].client;
    const clientUserObj = userCache[ownerId].info;
    const queue = userCache[ownerId].queue;

    const matchAccessLevel = config.userDefinedConfigs.matchSharedLinkAccessLevel;
    const newAccessLevel = config.userDefinedConfigs.newSharedLinkAccessLevel;

    //[OPTIONAL] Take action on ALL OBJECTS here
    if(config.modifyData) {
        //ACTUALLY MODIFY DATA
        if(getLinkAccess(itemObj.shared_link) === matchAccessLevel) {
            queue.add( async function() { await modifySharedLink(client, itemObj, newAccessLevel, executionID) });
        }
    } else {
        //PERFORM LOGGING FOR SIMULATION
        if(getLinkAccess(itemObj.shared_link) === matchAccessLevel) {
            queue.add( async function() { await simulateModifySharedLink(itemObj, newAccessLevel, executionID) });
        }
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


/* modifySharedLink()
 * param [object] client: Box API client for the user who owns the item
 * param [object] itemObj: Box item object (folder, file, web_link)
 * param [string] newAccessLevel: New shared link access level
 * param [string] executionID: Unique ID associated with a given execution loop
 * 
 * returns none
*/
async function modifySharedLink(client, itemObj, newAccessLevel, executionID) {
    let newItem;
    try {
        if(itemObj.type === "file") {
            newItem = await client.files.update(itemObj.id, 
            {
                shared_link: {
                    access: newAccessLevel
                },
                fields: config.boxItemFields
            })
        } else if(itemObj.type === "folder") {
            newItem = await client.folders.update(itemObj.id, 
                {
                    shared_link: {
                        access: newAccessLevel
                    },
                    fields: config.boxItemFields
                })
        } else if(itemObj.type === "web_link") {
            newItem = await client.weblinks.update(itemObj.id, 
                {
                    shared_link: {
                        access: newAccessLevel
                    },
                    fields: config.boxItemFields
                })
        }

        logger.info({
            label: "modifySharedLink",
            action: "MODIFY_SHARED_LINK",
            executionId: executionID,
            message: `Successfully modified shared link on ${newItem.type} "${newItem.id}" from ${itemObj.shared_link.access.toUpperCase()} to ${newItem.shared_link.access.toUpperCase()}`
        })

        logAudit(
            "SHARED_LINK_MODIFY",
            newItem,
            `Modified link ${newItem.shared_link.url} from ${itemObj.shared_link.access.toUpperCase()} to ${newItem.shared_link.access.toUpperCase()}`, 
            executionID
        );
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.warn({
                label: "modifySharedLink",
                action: "ADD_RETRY_CACHE",
                executionId: executionID,
                message: `Request for ${itemObj.type} "${itemObj.id}" rate limited -- Adding to retry cache`
            })
            cache.push(`getItemInfo|file:${fileID}|user:${clientUserObj.id}`);
        } else {
            logError(err, "modifySharedLink", `modification of shared link for ${itemObj.type} "${itemObj.id}"`, executionID);
        }
    }
}


/* simulateModifySharedLink()
 * param [object] itemObj: Box item object (folder, file, web_link)
 * param [string] newAccessLevel: New shared link access level
 * param [string] executionID: Unique ID associated with a given execution loop
 * 
 * returns none
*/
async function simulateModifySharedLink(itemObj, newAccessLevel, executionID) {
    logger.info({
        label: "simulateModifySharedLink",
        action: "SIMULATE_MODIFY_SHARED_LINK",
        executionId: executionID,
        message: `Would have modified link ${itemObj.shared_link.url} from ${itemObj.shared_link.access.toUpperCase()} to ${newAccessLevel.toUpperCase()}`
    })

    logAudit(
        "SIMULATE_SHARED_LINK_MODIFY",
        itemObj,
        `Would have modified link ${itemObj.shared_link.url} from ${itemObj.shared_link.access.toUpperCase()} to ${newAccessLevel.toUpperCase()}`, 
        executionID
    );
}

///////////////////////////////////////////////////////////////////////////