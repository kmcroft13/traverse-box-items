/*
 * INTRODUCTION
 * This script will traverse all items in a Box instance while honoring 
 * configurations for a whitelist or blacklist.
 * 
 * It also exposes a "performUserDefinedActions" function which allows for
 * custom business logic to be performed on each item retreived during traversal.
 * 
 * All custom business logic should be defined in 
 * the "USER DEFINED LOGIC" section below.
*/

////  USER DEFINED LOGIC  /////////////////////////////////////////////////
// Find examples of user defined business logic at: https://github.com/kmcroft13/traverse-box-items/tree/master/User%20Defined%20Logic%20Examples

///////////////////////////////////////////////////////////////////////////


////  LOAD MODULES  ///////////////////////////////////////////////////////
// Require module for Box SDK
const BoxSDK = require('box-node-sdk');
//Require modules from Winston (logging utility)
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
//Require modules from 'node-csv' (CSV parser)
const parse = require('csv-parse/lib/sync');
//Require node fs and path modules
const fs = require('fs');
const path = require('path');
//Require PQueue to control tasks
const PQueue = require('p-queue');

eval(fs.readFileSync('userDefinedLogic.js')+'');

//Initialize user cache
const userCache = {};

////  LOAD CONFIGURATIONS  ////////////////////////////////////////////////
// Load JSON from script config file
const scriptConfigFileName = './config.json';
const scriptConfigFileContent = fs.readFileSync(`./${scriptConfigFileName}`);
let config;
try{
    config = JSON.parse(scriptConfigFileContent);
} catch(err) {
    throw Error(`Could not read configuration file: ${err}`)
}
//Check for incompatible configurations
if((config.csv.enabled && config.whitelist.enabled) || (config.csv.enabled && config.blacklist.enabled)) {
    console.log(`\n\n=============== WARNING ===============\nThe "whitelist" and "blacklist" features cannot be used while the "CSV" feature is enabled.\nPlease either turn off the "CSV" feature or turn off both the "whitelist" and "blacklist" features and re-run the script to proceed.\n=======================================\n\n`)
    process.exit(9);
}

// Initialize the Box SDK from config file
const sdk = new BoxSDK({
  clientID: config.boxAppSettings.clientID,
  clientSecret: config.boxAppSettings.clientSecret,
  appAuth: config.boxAppSettings.appAuth,
  enterpriseID: config.boxAppSettings.enterpriseID,
  request: { strictSSL: true }
});
///////////////////////////////////////////////////////////////////////////


////  INITIALIZE LOGGING  /////////////////////////////////////////////////
if (!fs.existsSync('./runtimeLogs')){
    fs.mkdirSync('./runtimeLogs');
}
if (!fs.existsSync('./auditLogs')){
    fs.mkdirSync('./auditLogs');
}

const logFormat = printf(info => {
  return `${info.timestamp}\t${info.level.toUpperCase()}\t${info.executionId}\t${info.label}\t${info.action.toUpperCase()}\t${info.message}\t${info.errorDetails ? `\t${info.errorDetails}` : ``}`;
});

const actionFormat = printf(info => {
    return `${info.time ? `"${info.time}` : `"${info.timestamp}`}","${info.label.toUpperCase()}","${info.executionId}","${info.itemID}","${info.itemName}","${info.itemType}","${info.ownedByEmail}","${info.ownedByID}","${info.pathByNames}","${info.pathByIDs}","${info.itemCreatedAt}","${info.modifiedAt}","${info.size}","${info.sharedLink}","${info.sharedLinkAccess}","${info.message}"`;
  });

const customLogLevels = {
    levels: {
        action: 0
    }
  };

const logger = createLogger({
    format: combine(
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console({ level: 'debug', colorize: true }),
        new transports.File({ filename: path.join('runtimeLogs', '/scriptLog-error.log'), level: 'error' }),
        new transports.File({ filename: path.join('runtimeLogs', '/scriptLog-combined.log'), level: 'info' })
    ],
    exceptionHandlers: [
        new transports.Console(),
        new transports.File({ filename: path.join('runtimeLogs', '/scriptLog-exceptions.log') })
    ]
});

const d = new Date();
const datestring = ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + "-" + d.getFullYear() + "_" + ("0" + d.getHours()).slice(-2) + "-" + ("0" + d.getMinutes()).slice(-2);
const auditor = createLogger({
    format: combine(
        timestamp(),
        actionFormat
    ),
    levels: customLogLevels.levels,
    transports: [
        new transports.File({ filename: path.join('auditLogs', `/${datestring}_Results.csv`), level: 'action' })
    ]
});

//Workaround to create "header" row in Results log file
auditor.action({
    time: "TIMESTAMP",
    label: "ACTION",
    executionId: "EXECUTION_ID",
    itemID: "BOX_ITEM_ID",
    itemName: "BOX_ITEM_NAME",
    itemType: "BOX_ITEM_TYPE",
    ownedByEmail: "OWNED_BY_EMAIL",
    ownedByID: "OWNED_BY_ID",
    pathByNames: "PATH_BY_NAME",
    pathByIDs: "PATH_BY_ID",
    itemCreatedAt: "ITEM_CREATED_AT",
    modifiedAt: "ITEM_MODIFIED_AT",
    size: "ITEM_SIZE_BYTES",
    sharedLink: "ITEM_LINK",
    sharedLinkAccess: "LINK_ACCESS_LEVEL",
    message: "DETAILS"
});
///////////////////////////////////////////////////////////////////////////


////  CREATE BOX API CLIENTS  /////////////////////////////////////////////
//Service Account user
const serviceAccountClient = sdk.getAppAuthClient('enterprise', config.enterpriseId);
///////////////////////////////////////////////////////////////////////////


////  HELPER FUNCTIONS  ///////////////////////////////////////////////////
/* logError()
 * param [object] err: Error object returned from catch
 * param [string] functionName: NAme of the function which originated the error
 * param [string] failedEvent: Description of the action which failed
 * param [string] executionID: Unique ID associated with a given execution loop
 * 
 * returns none
*/
function logError(err, functionName, failedEvent, executionID) {
    if(err.response) {
        if(err.response.statusCode === 429) {
            logger.warn({
                label: functionName,
                action: "BOX_RATE_LIMITED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body.code) {
            logger.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body.error) {
            logger.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.error} | Message: ${err.response.body.error_description}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else {
            logger.error({
                label: functionName,
                action: "REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode}`,
                errorDetails: JSON.stringify(err.response)
            });
        }
    } else {
        logger.error({
            label: functionName,
            action: "UNKNOWN_ERROR",
            executionId: executionID,
            message: failedEvent,
            errorDetails: JSON.stringify(err)
        });
    }
}


/* logAudit()
 * param [string] action: Action that is being audited
 * param [object] boxItemObj: Box item object (folder, file, web_link)
 * param [string] message: Additional details about the event
 * param [string] executionID: Unique ID associated with a given execution loop
 * 
 * returns none
*/
function logAudit(action, boxItemObj, message, executionID) {
    auditor.action({
        label: action,
        executionId: executionID,
        itemID: boxItemObj.id,
        itemName: boxItemObj.name,
        itemType: boxItemObj.type,
        ownedByEmail: boxItemObj.owned_by.login,
        ownedByID: boxItemObj.owned_by.id,
        pathByNames: buildPathByName(boxItemObj),
        pathByIDs: buildPathByID(boxItemObj),
        itemCreatedAt: boxItemObj.created_at,
        modifiedAt: boxItemObj.modified_at,
        size: boxItemObj.size,
        sharedLink: getLinkURL(boxItemObj.shared_link),
        sharedLinkAccess: getLinkAccess(boxItemObj.shared_link),
        message: message
    });
}
///////////////////////////////////////////////////////////////////////////


////  CORE BUSINESS LOGIC  ////////////////////////////////////////////////

/* buildPathByName()
 * param [object] itemObj: Box item object (folder, file, web_link)
 * 
 * returns [string] Path to the item expressed as a string of item names separated by slashes ( / )
*/
function buildPathByName(itemObj) {
    let pathString = "";

    itemObj.path_collection.entries.forEach(function (item) {
        pathString += `/${item.name}`
    });

    pathString += `/${itemObj.name}`

    return pathString
}


/* buildPathByID()
 * param [object] itemObj: Box item object (folder, file, web_link)
 * 
 * returns [string] Path to the item expressed as a string of item IDs separated by slashes ( / )
*/
function buildPathByID(itemObj) {
    let pathString = "";

    itemObj.path_collection.entries.forEach(function (item) {
        pathString += `/${item.id}`
    });

    pathString += `/${itemObj.id}`

    return pathString
}


/* getLinkURL()
 * param [object] sharedLinkObj: Box shared_link sub-object from a file, folder, or web_link
 * 
 * returns [string] Shared Link URL or an empty string if no link
*/
function getLinkURL(sharedLinkObj) {
    let urlString;

    if (sharedLinkObj == null) {
        urlString = ""
    } else {
        urlString = sharedLinkObj.url
    }

    return urlString
}


/* getLinkAccess()
 * param [object] sharedLinkObj: Box shared_link sub-object from a file, folder, or web_link
 * 
 * returns [string] Shared Link access level or an empty string if no link
*/
function getLinkAccess(sharedLinkObj) {
    let accessString;

    if (sharedLinkObj == null) {
        accessString = ""
    } else {
        accessString = sharedLinkObj.access
    }

    return accessString
}


/* getFolderInfo()
 * param [string] ownerId: User ID for the user who owns the item
 * param [string] folderID: Folder ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box folder object for given folder ID
*/
async function getFolderInfo(ownerId, folderID, parentExecutionID) {

    logger.info({
        label: "getFolderInfo",
        action: "PREPARE_FOLDER_INFO",
        executionId: parentExecutionID,
        message: `Getting info for folder ${folderID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await userCache[ownerId].client.folders.get(folderID,
        {
            fields: config.boxItemFields
        })

        logger.info({
            label: "getFolderInfo",
            action: "RETRIEVE_FOLDER_INFO",
            executionId: executionID,
            message: `retrieved info for folder ${folderID}`
        })

        if(config.auditTraversal) {
            logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache[ownerId].queue.add( async function() { await performUserDefinedActions(item, executionID) });
        logger.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logError(err, "getFolderInfo", `Request for folder "${folderID}" rate limited -- Re-adding task to queue`, executionID);
            userCache[ownerId].queue.add( async function() { await getFolderInfo(ownerId, folderID, parentExecutionID) });
            logger.debug({
                label: "getFolderInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for folder ${folderID} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
            })
        } else {
            logError(err, "getFolderInfo", `retrieval of info for folder ${folderID} owned by ${userCache[ownerId].info.id}`, executionID);
        }
    }
}


/* getFileInfo()
 * param [string] ownerId: User ID for the user who owns the item
 * param [string] fileID: File ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box file object for given file ID
*/
async function getFileInfo(ownerId, fileID, parentExecutionID) {

    logger.info({
        label: "getFileInfo",
        action: "PREPARE_FILE_INFO",
        executionId: parentExecutionID,
        message: `Getting info for file ${fileID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await userCache[ownerId].client.files.get(fileID,
        {
            fields: config.boxItemFields
        })

        logger.info({
            label: "getFileInfo",
            action: "RETRIEVE_FILE_INFO",
            executionId: executionID,
            message: `retrieved info for file ${fileID}`
        })

        if(config.auditTraversal) {
            logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache[ownerId].queue.add( async function() { await performUserDefinedActions(ownerId, item, executionID) });
        logger.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logError(err, "getFileInfo", `Request for file "${fileID}" rate limited -- Re-adding task to queue`, executionID);
            userCache[ownerId].queue.add( async function() { await getFileInfo(fileID, parentExecutionID) });
            logger.debug({
                label: "getFileInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for file ${fileID} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
            })
        } else {
            logError(err, "getFileInfo", `retrieval of info for file ${fileID} owned by ${ownerId}`, executionID);
        }
    }
}


/* getWeblinkInfo()
 * param [string] ownerId: User ID for the user who owns the item
 * param [object] clientUserObj: Box user object associated with the client
 * param [string] weblinkID: File ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box file object for given file ID
*/
async function getWeblinkInfo(ownerId, weblinkID, parentExecutionID) {

    logger.info({
        label: "getWeblinkInfo",
        action: "PREPARE_WEBLINK_INFO",
        executionId: parentExecutionID,
        message: `Getting info for weblink ${weblinkID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await userCache[ownerId].client.weblinks.get(weblinkID,
        {
            fields: config.boxItemFields
        })

        logger.info({
            label: "getWeblinkInfo",
            action: "RETRIEVE_WEBLINK_INFO",
            executionId: executionID,
            message: `retrieved info for weblink ${weblinkID}`
        })

        if(config.auditTraversal) {
            logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache[ownerId].queue.add( async function() { performUserDefinedActions(ownerId, item, executionID) });
        logger.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logError(err, "getWeblinkInfo", `Request for weblink "${weblinkID}" rate limited -- Re-adding task to queue`, executionID);
            userCache[ownerId].queue.add( async function() { await getWeblinkInfo(ownerId, weblinkID, parentExecutionID) });
            logger.debug({
                label: "getWeblinkInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for weblink ${weblinkID} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
            })
        } else {
            logError(err, "getWeblinkInfo", `retrieval of info for weblink ${weblinkID} owned by ${ownerId}`, executionID);
        }
    }
}


/* getEnterpriseUsers()
 * param [string] client: Box API Service Account client to get users
 * 
 * returns [object] array of folder and file objects
*/
async function getEnterpriseUsers(client) {
    let enterpriseUsers;
    let allUsers = [];
    let offset;
    let totalCount;
    try {
        do {
            enterpriseUsers = await client.enterprise.getUsers({
                limit: 1000,
                offset: offset,
                user_type: client.enterprise.userTypes.MANAGED
            });
            
            allUsers = allUsers.concat(enterpriseUsers.entries);
            offset = enterpriseUsers.offset + enterpriseUsers.limit;
            totalCount = enterpriseUsers.total_count;

            logger.info({
                label: "getEnterpriseUsers",
                action: "RETRIEVE_ENTERPRISE_USERS_PAGE",
                executionId: "N/A",
                message: `retrieved ${allUsers.length} of ${totalCount} enterprise users`
            })
        }
        while(offset <= totalCount);
    } catch(err) {
        logError(err, "getEnterpriseUsers", `retrieval of enterprise users`, "N/A")
    }

    logger.info({
        label: "getEnterpriseUsers",
        action: "RETRIEVE_ENTERPRISE_USERS",
        executionId: "N/A",
        message: `Successfully retrieved all enterprise users`
    })
    
    return allUsers;
}


/* getFolderItems()
 * param [string] ownerId: User ID for the user who owns the item
 * param [string] folderID: Folder ID to get items of
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] array of folder and file objects
*/
async function getFolderItems(ownerId, folderID, parentExecutionID) {
    let folderItems;
    let allItems = [];
    let offset;
    let totalCount;
    try {
        do {
            folderItems = await userCache[ownerId].client.folders.getItems(folderID, {
                fields: config.boxItemFields,
                offset: offset,
                limit: 1000
            });
            
            allItems = allItems.concat(folderItems.entries);
            offset = folderItems.offset + folderItems.limit;
            totalCount = folderItems.total_count;

            logger.info({
                label: "getFolderItems",
                action: "RETRIEVE_FOLDER_ITEMS_PAGE",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} items from folder ${folderID}`
            })
        }
        while(offset <= totalCount);

        if(folderID === '0') {
            logger.info({
                label: "getFolderItems",
                action: "RETRIEVE_ROOT_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} root items for "${userCache[ownerId].info.name}" (${userCache[ownerId].info.id})`
            })
        } else {
            logger.info({
                label: "getFolderItems",
                action: "RETRIEVE_CHILD_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} child items for folder ${folderID}`
            })
        }
    } catch(err) {
        //Need to throw error here so that it propogates up to next try/catch
        logError(err, "getFolderItems", `Retrieval of child items for folder ${folderID} owned by ${userCache[ownerId].info.id}`, parentExecutionID);
        throw Error(`Retrieval of child items for folder ${folderID} owned by ${userCache[ownerId].info.id} failed`);
    }
    
    return allItems;
}


/* processFolderItems()
 * param [string] ownerId: User ID for the user who owns the item
 * param [string] folderID: Folder ID to get items of
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * param [boolean] (Optional; Default = true) followChildItems: Identifies whether or not recursion should occur
 * param [boolean] (Optional; Default = false) firstIteration: Identifies whether this is the first loop iteration
 * 
 * returns [object] array of folder and file objects
*/
async function processFolderItems(ownerId, folderID, parentExecutionID, followChildItems = true, firstIteration = false) {
    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)
    
    if(folderID === '0') {
        logger.info({
            label: "processFolderItems",
            action: "PREPARE_ROOT_ITEMS",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Beginning to traverse root items for "${userCache[ownerId].info.name}" (${userCache[ownerId].info.id})`
        })
    } else {
        logger.info({
            label: "processFolderItems",
            action: "PREPARE_CHILD_ITEMS",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Beginning to get child items for folder ${folderID}`
        })
    }

    //Get all items in folder
    let items;
    try {
        items = await getFolderItems(ownerId, folderID, executionID);
    } catch(err) {
        logError(err, "processFolderItems", `Error retrieving folder items -- Re-adding task to queue`, executionID);
        userCache[ownerId].queue.add( async function() { await processFolderItems(ownerId, folderID, parentExecutionID, followChildItems, firstIteration) });
        logger.debug({
            label: "processFolderItems",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task to process items for folder ${folderID} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })
        logger.warn({
            label: "processFolderItems",
            action: "KILL_TASK",
            executionId: executionID,
            message: `Stopping task due to propogated error`
        })

        return;
    }

    //If this is the first iteration and not the root folder, take action on starting folder itself
    //This only applies if using whitelist configuration!
    if(firstIteration && folderID !== '0') {
        userCache[ownerId].queue.add( async function() { await getFolderInfo(ownerId, folderID, executionID) });
        logger.debug({
            label: "getFolderInfo",
            action: "ADD_TO_QUEUE",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Added task for folder ${folderID} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })
    }

    for (let i in items) {
        //If getting root items, check if item is owned by the current user and if skip nonOwnedItems flag is true
        if(folderID === '0' && items[i].owned_by.id !== ownerId && config.nonOwnedItems.skip) {
            //Log item then skip it
            logger.debug({
                label: "processFolderItems",
                action: "IGNORE_NONOWNED_ITEM",
                executionId: executionID,
                message: `Skipping ${items[i].type} "${items[i].name}" (${items[i].id}) owned by ${items[i].owned_by.login} (${items[i].owned_by.id})`
            })

            if(config.nonOwnedItems.audit) {
                logAudit(
                    "SKIP_ITEM", 
                    items[i], 
                    `Successfully retrieved skipped item`, 
                    executionID
                );
            }

            continue;
        }

        //If blacklist is enabled and if folder is included in blacklist
        if(items[i].type === "folder" && config.blacklist.enabled && config.blacklist.folders.includes(items[i].id)) {
            //Log item then skip it
            logger.warn({
                label: "processFolderItems",
                action: "IGNORE_BLACKLIST_ITEM",
                executionId: executionID,
                message: `Folder "${items[i].name}" (${items[i].id}) is included in configured blacklist - Ignoring`
            })

            continue;
        }

        if(config.auditTraversal) {
            logAudit(
                "GET_ITEM", 
                items[i], 
                `Successfully retrieved item`, 
                executionID
            );
        }

        //PERFORM USER DEFINED ACTION(S)
        //Pass item object to user defined functions
        userCache[ownerId].queue.add( async function() { await performUserDefinedActions(ownerId, items[i], executionID) });
        logger.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${items[i].type} ${items[i].id} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
        })

        //Only recurse if item is folder and if followChildItems is true
        if(items[i].type === "folder" && followChildItems) {
            userCache[ownerId].queue.add( async function() { return await processFolderItems(ownerId, items[i].id, executionID) });
            logger.debug({
                label: "processFolderItems",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task to process items for ${items[i].type} ${items[i].id} | Queue ${ownerId} size: ${userCache[ownerId].queue.size}`
            })
        }
    };

    return
}


/* getUserItems()
 * param [object OR string] user: Box user object or user ID specifying where to start loop
 * param [string] startingFolderID: Folder ID specifying where to start loop
 * param [boolean] (Optional; Default = true) followChildItems: Identifies whether or not recursion should occur
 * 
 * returns none
*/
async function getUserItems(userId, startingFolderID, followChildItems = true) {
    //Generate a unique execution ID to track loop execution across functions
    const executionID = (Math.random()* 1e20).toString(36)

    logger.info({
        label: "getUserItems",
        action: "PREPARE_GET_ITEMS",
        executionId: executionID,
        message: `Preparing to get items for user ${userId} on folder "${startingFolderID}"`
    })
    
    //Establish BoxSDK client for user
    const userClient = sdk.getAppAuthClient('user', userId);

    //Try to get user info to test access and authorization before traversal
    try{
        const userInfo = await userClient.users.get(userClient.CURRENT_USER_ID)

        userCache[userInfo.id] = { 
            queue: new PQueue({interval: 1000, intervalCap: 16, carryoverConcurrencyCount: false}),
            client: userClient,
            info: userInfo
        };

        userCache[userInfo.id].queue.onIdle().then(() => {
            logger.info({
                label: "traverse",
                action: "FINISHED_TASK_QUEUE",
                executionId: userInfo.id,
                message: `All tasks processed for "${userInfo.name}" (${userInfo.id}) - Closing queue`
            })
        });

        logger.info({
            label: "getUserItems",
            action: "RETRIEVE_USER_INFO",
            executionId: executionID,
            message: `Successfully retrieved user info for "${userInfo.name}" (${userInfo.id})`
        })

        logger.info({
            label: "traverse",
            action: "INITIALIZE_TASK_QUEUE",
            executionId: userInfo.id,
            message: `Successfully initialized a task queue for "${userInfo.name}" (${userInfo.id})`
        })
        
        userCache[userInfo.id].queue.add( async function() { return await processFolderItems(userInfo.id, startingFolderID, executionID, followChildItems, true) } );
        logger.debug({
            label: "processFolderItems",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task to process items for folder ${startingFolderID} | Queue ${userInfo.id} size: ${userCache[userInfo.id].queue.size}`
        })
    } catch(err) {
        logError(err, "getUserItems", `Retrieval of user info for user "${userId}"`, executionID)
    }
}


/* traverse()
 * 
 * returns none
*/
async function traverse() {
    //Check if whitelist is enabled
    if(config.csv.enabled) {
        //Generate unique executionID for this loop
        const executionID = (Math.random()* 1e20).toString(36);
        //Read wave analysis CSV
        const rawCsv = fs.readFileSync(`${config.csv.filePath}`, 'utf8');
        //Parse wave analysis CSV to JSON
        const parsedCsv = parse(rawCsv, {columns: true, skip_empty_lines: true, skip_lines_with_empty_values: true});
        //Get all Enterprise users
        const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);
    
        for (row of parsedCsv) {
            const boxUser = enterpriseUsers.filter( user => user.login === row.owner_login);

            //If user in inactive in Box
            if(boxUser[0].status !== "active") {
                //Log user then skip it
                logger.warn({
                    label: "traverse",
                    action: "NON_ACTIVE_USER",
                    executionId: "N/A",
                    message: `User "${boxUser[0].name}" (${boxUser[0].id}) has a non-active status - Ignoring ${row.type} ${row.item_id}`
                })

                continue;
            };
    
            logger.info({
                label: "traverse",
                action: "PARSE_CSV_ROW",
                executionId: executionID,
                message: `Processing ${row.type} "${row.item_id}" owned by ${row.owner_login}`
            })
    
            const userClient = sdk.getAppAuthClient('user', boxUser[0].id);
    
            userCache[boxUser[0].id] = { 
                queue: new PQueue({interval: 1000, intervalCap: 16, carryoverConcurrencyCount: false}),
                client: userClient,
                info: boxUser[0]
            };

            logger.info({
                label: "traverse",
                action: "INITIALIZE_TASK_QUEUE",
                executionId: userInfo.id,
                message: `Successfully initialized a task queue for "${boxUser[0].name}" (${boxUser[0].id})`
            })

            userCache[boxUser[0].id].queue.onIdle().then(() => {
                logger.info({
                    label: "traverse",
                    action: "FINISHED_TASK_QUEUE",
                    executionId: userInfo.id,
                    message: `All tasks processed for "${userInfo.name}" (${userInfo.id}) - Closing this queue`
                })
            });

            if(row.type === "file") {
                userCache[boxUser[0].id].queue.add( async function() { await getFileInfo(userClient, boxUser[0], row.item_id, executionID) });
                logger.debug({
                    label: "getFileInfo",
                    action: "ADD_TO_QUEUE",
                    executionId: executionID,
                    message: `Added task for ${row.type} ${row.item_id} | Queue ${ownerId} size: ${userCache[boxUser[0].id].queue.size}`
                })
            } else if (row.type === "folder") {
                userCache[boxUser[0].id].queue.add( async function() { await getFolderInfo(userClient, boxUser[0], row.item_id, executionID) });
                logger.debug({
                    label: "getFileInfo",
                    action: "ADD_TO_QUEUE",
                    executionId: executionID,
                    message: `Added task for ${row.type} ${row.item_id} | Queue ${ownerId} size: ${userCache[boxUser[0].id].queue.size}`
                })
            } else { //web_link
                userCache[boxUser[0].id].queue.add( async function() { await getWeblinkInfo(userClient, boxUser[0], row.item_id, executionID) });
                logger.debug({
                    label: "getFileInfo",
                    action: "ADD_TO_QUEUE",
                    executionId: executionID,
                    message: `Added task for ${row.type} ${row.item_id} | Queue ${ownerId} size: ${userCache[boxUser[0].id].queue.size}`
                })
            }
    
        }
    } else if(config.whitelist.enabled) {
        logger.info({
            label: "traverse",
            action: "WHITELIST",
            executionId: "N/A",
            message: `Preparing to iterate through whitelist`
        })

        for (let i in config.whitelist.items) {
            //Check if we should recurse through child items for this user's whitelist
            for (let folderID in config.whitelist.items[i].folderIDs) {
                getUserItems(config.whitelist.items[i].ownerID, folderID, config.whitelist.items[i].followAllChildItems)
                logger.info({
                    label: "traverse",
                    action: "CREATED_TRAVERSAL_TASK",
                    executionId: "N/A",
                    message: `Created a traversal task for folder ${folderId} owned by ${config.whitelist.items[i].ownerID})`
                })
            };
        }

    } else { //Whitelist not enabled, perform actions on all users (honoring blacklist)
        //Get all enterprise users
        const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);


        for (let i in enterpriseUsers) {
            //Check if user is included in blacklist
            if(config.blacklist.enabled && config.blacklist.users.includes(enterpriseUsers[i].id)) {
                //Log item then skip it
                logger.warn({
                    label: "traverse",
                    action: "IGNORE_USER",
                    executionId: "N/A",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) is included in configured blacklist - Ignoring`
                })

                continue;
            }

            //If user in inactive in Box
            if(enterpriseUsers[i].status !== "active") {
                //Log user then skip it
                logger.warn({
                    label: "traverse",
                    action: "NON_ACTIVE_USER",
                    executionId: "N/A",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) has a non-active status - Ignoring`
                })

                continue;
            };

            const startingFolderID = '0';
            getUserItems(enterpriseUsers[i].id, startingFolderID)
            logger.info({
                label: "traverse",
                action: "CREATED_TRAVERSAL_TASK",
                executionId: "N/A",
                message: `Created a traversal task for user "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id})`
            })
        };
    }
}


/* index()
 * returns none
*/
async function index() {

    logger.info({
        label: "index",
        action: "INITIALIZE_TRAVERSAL_TASKS",
        executionId: "N/A",
        message: `Preparing to create traverse tasks for all items`
    })

    await traverse();

    logger.info({
        label: "index",
        action: "TRAVERSAL_TASKS_INITIALIZED",
        executionId: "N/A",
        message: `All traverse tasks have been created and are pending completion`
    })
}

// Check for incompatible configurations
if(config.whitelist.enabled && config.blacklist.enabled && config.blacklist.users) {
    console.log('\n\n=============== WARNING ===============\nBlacklist users are ignored when both blacklist and whitelist are enabled together. Continuing automatically in 10 seconds...\n=======================================\n\n');
    setTimeout(function () {
        index();
    }, 10000)
} else {
    // THIS IS WHERE THE MAGIC HAPPENS, PEOPLE
    index();
}