/*
 * INTRODUCTION
 * This script will traverse all items in a Box instance while honoring 
 * configurations for a whitelist or blacklist.
 * 
 * A "performUserDefinedActions" function is also exposed which allows for
 * custom business logic to be performed on each item retrieved during traversal.
 * 
 * All custom business logic should be defined in 
 * the "USER DEFINED LOGIC" section below.
*/

////  USER DEFINED LOGIC  /////////////////////////////////////////////////

/* performUserDefinedActions()
 * param [object] client:
 * param [object] clientUserObj:
 * param [object] itemObj:
 * param [string] parentExecutionID: 
 * 
 * returns none
*/
async function performUserDefinedActions(client, clientUserObj, itemObj, parentExecutionID) { 
    logger.debug({
        label: "performUserDefinedActions",
        action: "PREPARE_USER_DEFINED_ACTION",
        executionId: parentExecutionID,
        message: `Preparing to perform user defined action for ${itemObj.type} "${itemObj.id}"`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    const matchAccessLevel = config.userDefinedConfigs.matchSharedLinkAccessLevel;
    const newAccessLevel = config.userDefinedConfigs.newSharedLinkAccessLevel;

    //[OPTIONAL] Take action on ALL OBJECTS here
    if(config.modifyData) {
        //ACTUALLY MODIFY DATA
        if(getLinkAccess(itemObj.shared_link) === matchAccessLevel) {
            modifySharedLink(client, itemObj, newAccessLevel, executionID)
        }
    } else {
        //PERFORM LOGGING FOR SIMULATION
        if(getLinkAccess(itemObj.shared_link) === matchAccessLevel) {
            simulateModifySharedLink(itemObj, newAccessLevel, executionID)
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


////  LOAD MODULES  ///////////////////////////////////////////////////////
// Require module for Box SDK
const BoxSDK = require('box-node-sdk');
//Require modules from Winston (logging utility)
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
//Require modules from 'node-csv' (CSV parser and creator)
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify');
//Require linked list package for caching errors and initialize cache
const LinkedList = require('linkedlist');
const cache = new LinkedList();
//Require node fs and path modules
const fs = require('fs');
const path = require('path');
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
            logger.error({
                label: functionName,
                action: "BOX_RATE_LIMITED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body) {
            logger.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
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
 * param [object] client: Box API client for the user who owns the item
 * param [object] clientUserObj: Box user object associated with the client
 * param [string] folderID: Folder ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box folder object for given folder ID
*/
async function getFolderInfo(client, clientUserObj, folderID, parentExecutionID) {

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
        item = await client.folders.get(folderID,
        {
            fields: config.boxItemFields
        })

        logger.info({
            label: "getFolderInfo",
            action: "retrieve_FOLDER_INFO",
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
        performUserDefinedActions(client, clientUserObj, item, executionID);
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.warn({
                label: "getFolderInfo",
                action: "ADD_RETRY_CACHE",
                executionId: executionID,
                message: `Request for folder "${folderID}" rate limited -- Adding to retry cache`
            })
            cache.push(`getItemInfo|folder:${folderID}|user:${clientUserObj.id}`);
        } else {
            logError(err, "getFolderInfo", `retrieval of info for folder ${folderID} owned by ${clientUserObj.id}`, executionID);
        }
    }
}


/* getFileInfo()
 * param [object] client: Box API client for the user who owns the item
 * param [object] clientUserObj: Box user object associated with the client
 * param [string] fileID: File ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box file object for given file ID
*/
async function getFileInfo(client, clientUserObj, fileID, parentExecutionID) {

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
        item = await client.files.get(fileID,
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
        performUserDefinedActions(client, clientUserObj, item, executionID);
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.warn({
                label: "getFileInfo",
                action: "ADD_RETRY_CACHE",
                executionId: executionID,
                message: `Request for file "${fileID}" rate limited -- Adding to retry cache`
            })
            cache.push(`getItemInfo|file:${fileID}|user:${clientUserObj.id}`);
        } else {
            logError(err, "getFileInfo", `retrieval of info for file ${fileID} owned by ${clientUserObj.id}`, executionID);
        }
    }
}


/* getWeblinkInfo()
 * param [object] client: Box API client for the user who owns the item
 * param [object] clientUserObj: Box user object associated with the client
 * param [string] weblinkID: File ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box file object for given file ID
*/
async function getWeblinkInfo(client, clientUserObj, weblinkID, parentExecutionID) {

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
        item = await client.weblinks.get(weblinkID,
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
        performUserDefinedActions(client, clientUserObj, item, executionID);
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.warn({
                label: "getWeblinkInfo",
                action: "ADD_RETRY_CACHE",
                executionId: executionID,
                message: `Request for weblink "${weblinkID}" rate limited -- Adding to retry cache`
            })
            cache.push(`getItemInfo|web_link:${weblinkID}|user:${clientUserObj.id}`);
        } else {
            logError(err, "getWeblinkInfo", `retrieval of info for weblink ${weblinkID} owned by ${clientUserObj.id}`, executionID);
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
                action: "retrieve_ENTERPRISE_USERS_PAGE",
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
        action: "retrieve_ENTERPRISE_USERS",
        executionId: "N/A",
        message: `Successfully retrieved all enterprise users`
    })
    
    return allUsers;
}


/* getFolderItems()
 * param [string] client: Box API Service Account client to get users
 * param [string] clientUserObj: Box user object associated with the client
 * param [string] folderID: Folder ID to get items of
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] array of folder and file objects
*/
async function getFolderItems(client, clientUserObj, folderID, parentExecutionID) {
    let folderItems;
    let allItems = [];
    let offset;
    let totalCount;
    try {
        do {
            folderItems = await client.folders.getItems(folderID, {
                fields: config.boxItemFields,
                offset: offset,
                limit: 1000
            });
            
            allItems = allItems.concat(folderItems.entries);
            offset = folderItems.offset + folderItems.limit;
            totalCount = folderItems.total_count;

            logger.info({
                label: "getFolderItems",
                action: "retrieve_FOLDER_ITEMS_PAGE",
                executionId: parentExecutionID,
                message: `retrieved ${allItems.length} of ${totalCount} items from folder ${folderID}`
            })
        }
        while(offset <= totalCount);

        if(folderID === '0') {
            logger.info({
                label: "getFolderItems",
                action: "retrieve_ROOT_ITEMS",
                executionId: parentExecutionID,
                message: `retrieved root items for "${clientUserObj.name}" (${clientUserObj.id})`
            })
        } else {
            logger.info({
                label: "getFolderItems",
                action: "retrieve_CHILD_ITEMS",
                executionId: parentExecutionID,
                message: `retrieved child items for folder ${folderID}`
            })
        }
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.warn({
                label: "getFolderItems",
                action: "ADD_RETRY_CACHE",
                executionId: parentExecutionID,
                message: `Request for folder "${folderID}" rate linmited -- Adding to retry cache`
            })
            cache.push(`getFolderItems|folder:${folderID}|user:${clientUserObj.id}`);
        } else {
            logError(err, "getFolderItems", `retrieval of child items for folder ${folderID} owned by ${clientUserObj.id}`, parentExecutionID);
        }
    }
    
    return allItems;
}


/* processFolderItems()
 * param [string] client: Box API client for the user who owns the item
 * param [string] clientUserObj: Box user object associated with the client
 * param [string] folderID: Folder ID to get items of
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * param [boolean] (Optional; Default = true) followChildItems: Identifies whether or not recursion should occur
 * param [boolean] (Optional; Default = false) firstIteration: Identifies whether this is the first loop iteration
 * 
 * returns [object] array of folder and file objects
*/
async function processFolderItems(client, clientUserObj, folderID, parentExecutionID, followChildItems = true, firstIteration = false) {
    if(folderID === '0') {
        logger.info({
            label: "processFolderItems",
            action: "PREPARE_ROOT_ITEMS",
            executionId: parentExecutionID,
            message: `Beginning to traverse root items for "${clientUserObj.name}" (${clientUserObj.id})`
        })
    } else {
        logger.info({
            label: "processFolderItems",
            action: "PREPARE_CHILD_ITEMS",
            executionId: parentExecutionID,
            message: `Beginning to get child items for folder ${folderID}`
        })
    }

    //If this is the first iteration and not the root folder, take action on starting folder itself
    //This only applies if using whitelist configuration!
    if(firstIteration && folderID !== '0') {
        getFolderInfo(client, clientUserObj, folderID, parentExecutionID)
    }

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    //Get all items in folder
    const items = await getFolderItems(client, clientUserObj, folderID, executionID);

    for (let i in items) {
        //If getting root items, check if item is owned by the current user and if skip nonOwnedItems flag is true
        if(folderID === '0' && items[i].owned_by.id !== clientUserObj.id && config.nonOwnedItems.skip) {
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

            return;
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

            return;
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
        performUserDefinedActions(client, clientUserObj, items[i], executionID);

        //Only recurse if item is folder and if followChildItems is true
        if(items[i].type === "folder" && followChildItems) {
            processFolderItems(client, clientUserObj, items[i].id, executionID);
        }
    };
}


/* getUserItems()
 * param [object OR string] user: Box user object or user ID specifying where to start loop
 * param [string] startingFolderID: Folder ID specifying where to start loop
 * param [boolean] (Optional; Default = true) followChildItems: Identifies whether or not recursion should occur
 * 
 * returns none
*/
async function getUserItems(user, startingFolderID, followChildItems = true) {
    //Normalize input user info
    let userName;
    let userID;
    if(typeof user === "object") {
        userName = user.name;
        userID = user.id;
    } else {
        userName = "UNKNOWN";
        userID = user;
    }

    //Generate a unique execution ID to track loop execution across functions
    const executionID = (Math.random()* 1e20).toString(36)

    logger.info({
        label: "getUserItems",
        action: "PREPARE_GET_ITEMS",
        executionId: executionID,
        message: `Preparing to get items for "${userName}" (${userID}) on folder "${startingFolderID}"`
    })
    
    //Establish BoxSDK client for user
    const userClient = sdk.getAppAuthClient('user', userID);

    //Try to get user info to test access and authorization before traversal
    try{
        const userInfo = await userClient.users.get(userClient.CURRENT_USER_ID)
        userCache[userInfo.id] = userInfo;

        logger.info({
            label: "getUserItems",
            action: "retrieve_USER_INFO",
            executionId: executionID,
            message: `Successfully retrieved user info for "${userName}" (${userID}) - Proceeding with traversal on folder "${startingFolderID}"`
        })
        
        await processFolderItems(userClient, userInfo, startingFolderID, executionID, followChildItems, true);
    } catch(err) {
        logError(err, "getUserItems", `retrieval of user info for user "${userName}" (${userID})`, executionID)
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
            
            userCache[boxUser[0].id] = boxUser[0];
    
            logger.info({
                label: "traverse",
                action: "PARSE_CSV_ROW",
                executionId: executionID,
                message: `Processing ${row.type} "${row.item_id}" owned by ${row.owner_login}`
            })
    
            const userClient = sdk.getAppAuthClient('user', boxUser[0].id);
    
            if(row.type === "file") {
                await getFileInfo(userClient, boxUser[0], row.item_id, executionID);
            } else if (row.type === "folder") {
                await getFolderInfo(userClient, boxUser[0], row.item_id, executionID);
            } else { //web_link
                await getWeblinkInfo(userClient, boxUser[0], row.item_id, executionID);
            }
    
        }
    } else if(config.whitelist.enabled) {
        logger.info({
            label: "traverse",
            action: "WHITELIST",
            executionId: "N/A",
            message: `Preparing to iterate through whitelist`
        })

        async function loopThruWhitelist() {
            //Loop through all items in whitelist
            for (let i in config.whitelist.items) {
                //Check if we should recurse through child items for this user's whitelist
                for (let folderID in config.whitelist.items[i].folderIDs) {
                    await getUserItems(config.whitelist.items[i].ownerID, folderID, config.whitelist.items[i].followAllChildItems)
                };
            };
        }
        await loopThruWhitelist();
    } else { //Whitelist not enabled, perform actions on all users (honoring blacklist)
        //Get all enterprise users
        const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);

        async function loopThruEnterpriseUsers(enterpriseUsers) {
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
                await getUserItems(enterpriseUsers[i], startingFolderID)
            };
        }
        await loopThruEnterpriseUsers(enterpriseUsers);
    }
}


/* processRetries()
 * 
 * returns none
*/
async function processRetries() {
    do {
        //Generate unique executionID for this loop
        const executionID = (Math.random()* 1e20).toString(36);
        const retryItem = cache.shift().split('|');
        const action = retryItem[0];
        const itemType = retryItem[1].split(':')[0];
        const itemID = retryItem[1].split(':')[1];
        const userID = retryItem[2].split(':')[1];

        logger.info({
            label: "processRetries",
            action: "PREPARE_RETRY_ITEM",
            executionId: executionID,
            message: `Preparing to ${action} on folder ${itemID} for user ${userID} | Remaining cache size: ${cache.length}`
        })

        try{
            const userClient = sdk.getAppAuthClient('user', userID);
            const userInfo = userCache[userID];
    
            if(action === 'getFolderInfo') {
                await getFolderInfo(userClient, userInfo, itemID, executionID);
            } else if(action === 'getFolderItems') {
                await processFolderItems(userClient, userInfo, itemID, executionID);
            } else if(action === 'getItemInfo') {
                if(itemType === "file") {
                    await getFileInfo(userClient, userInfo, itemID, executionID);
                } else if(itemType === "folder") {
                    await getFolderInfo(userClient, userInfo, itemID, executionID);
                } else if(itemType === "web_link") {
                    await getWeblinkInfo(userClient, userInfo, itemID, executionID);
                }
            }
        } catch(err) {
            logError(err, "processRetries", `retrying ${action} on folder "${itemID}" for user "${userID}"`, executionID)
        }
    }
    while (cache.length);
}


/* index()
 * 
 * returns none
*/
async function index() {

    logger.info({
        label: "index",
        action: "BEGIN_TRAVERSE",
        executionId: "N/A",
        message: `Preparing to traverse`
    })

    await traverse();

    logger.info({
        label: "index",
        action: "END_TRAVERSE",
        executionId: "N/A",
        message: `Completed traverse`
    })

    logger.info({
        label: "index",
        action: "BEGIN_PROCESS_ERRORS",
        executionId: "N/A",
        message: `Preparing to process error cache`
    })

    if(cache.length) {
        await processRetries();
    }

    logger.info({
        label: "index",
        action: "END_PROCESS_ERRORS",
        executionId: "N/A",
        message: `Completed processing error cache`
    })

}

// Check for incompatible configurations
if(config.whitelist.enabled && config.blacklist.enabled && config.blacklist.users) {
    console.log('\n\n=============== WARNING ===============\nBlacklist users are ignored when both blacklist and whitelist are enabled together. Continuing automatically in 10 seconds...\n=======================================\n\n');
    setTimeout(function () {
        logger.debug({
            label: "script root",
            action: "START",
            executionId: "N/A",
            message: `Starting index()`
        });

        index();

        logger.debug({
            label: "script root",
            action: "COMPLETE",
            executionId: "N/A",
            message: `index() completed`
        });
    }, 10000)
} else {
    logger.debug({
        label: "script root",
        action: "START",
        executionId: "N/A",
        message: `Starting index()`
    });
    
    // THIS IS WHERE THE MAGIC HAPPENS, PEOPLE
    index();
    
    logger.debug({
        label: "script root",
        action: "COMPLETE",
        executionId: "N/A",
        message: `index() completed`
    });
}