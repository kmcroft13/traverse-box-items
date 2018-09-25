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
            itemObj,
            `Modified link ${newItem.shared_link.url} from ${itemObj.shared_link.access.toUpperCase()} to ${newItem.shared_link.access.toUpperCase()}`, 
            executionID
        );
    } catch(err) {
        logError(err, "modifySharedLink", `modification of shared link for ${itemObj.type} "${itemObj.id}"`, executionID)
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
//Require node fs and path modules
const fs = require('fs');
const path = require('path');


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

// Check for incompatible configurations
if(config.blacklist.enabled && config.whitelist.enabled) {
    throw Error(`Incompatible configuration: Cannot have blacklist and whitelist enabled at the same time"`)
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
        new transports.Console({ level: 'action' }),
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
 * returns NONE
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
        message: `Getting info for starting folder ${folderID}`
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
            action: "RETREIVE_FOLDER_INFO",
            executionId: executionID,
            message: `Retreived info for folder ${folderID}`
        })
    } catch(err) {
        logError(err, "getFolderInfo", `retreival of info for folder ${folderID}`, executionID)
    }
    
    if(config.auditTraversal) {
        logAudit(
            "GET_ITEM", 
            item, 
            `Successfully retreived item`, 
            executionID
        );
    }

    //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
    //Pass item object to user defined functions
    performUserDefinedActions(client, clientUserObj, item, executionID);

    return item;
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
                action: "RETREIVE_ENTERPRISE_USERS_PAGE",
                executionId: "N/A",
                message: `Retreived ${allUsers.length} of ${totalCount} enterprise users`
            })
        }
        while(offset <= totalCount);
    } catch(err) {
        logError(err, "getEnterpriseUsers", `retreival of enterprise users`, "N/A")
    }

    logger.info({
        label: "getEnterpriseUsers",
        action: "RETREIVE_ENTERPRISE_USERS",
        executionId: "N/A",
        message: `Successfully retreived all enterprise users`
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
                action: "RETREIVE_FOLDER_ITEMS_PAGE",
                executionId: parentExecutionID,
                message: `Retreived ${allItems.length} of ${totalCount} folder items users`
            })
        }
        while(offset <= totalCount);
    } catch(err) {
        logError(err, "getFolderItems", `retreival of child items for folder ${folderID}`, parentExecutionID)
    }

    if(folderID === '0') {
        logger.info({
            label: "processFolderItems",
            action: "RETREIVE_ROOT_ITEMS",
            executionId: parentExecutionID,
            message: `Retreived root items for "${clientUserObj.name}" (${clientUserObj.id})`
        })
    } else {
        logger.info({
            label: "processFolderItems",
            action: "RETREIVE_CHILD_ITEMS",
            executionId: parentExecutionID,
            message: `Retreived child items for folder ${folderID}`
        })
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

    items.forEach(function (item) {
        //If getting root items, check if item is owned by the current user and if skip nonOwnedItems flag is true
        if(folderID === '0' && item.owned_by.id !== clientUserObj.id && config.nonOwnedItems.skip) {
            //Log item then skip it
            logger.debug({
                label: "processFolderItems",
                action: "IGNORE_NONOWNED_ITEM",
                executionId: executionID,
                message: `Skipping ${item.type} "${item.name}" (${item.id}) owned by ${item.owned_by.login} (${item.owned_by.id})`
            })

            if(config.nonOwnedItems.audit) {
                logAudit(
                    "SKIP_ITEM", 
                    item, 
                    `Successfully retreived skipped item`, 
                    executionID
                );
            }

            return;
        }

        //If blacklist is enabled and if folder is included in blacklist
        if(item.type === "folder" && config.blacklist.enabled && config.blacklist.folders.includes(item.id)) {
            //Log item then skip it
            logger.warn({
                label: "processFolderItems",
                action: "IGNORE_BLACKLIST_ITEM",
                executionId: executionID,
                message: `Folder "${item.name}" (${item.id}) is included in configured blacklist - Ignoring`
            })

            return;
        }

        if(config.auditTraversal) {
            logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retreived item`, 
                executionID
            );
        }

        //PERFORM USER DEFINED ACTION(S)
        //Pass item object to user defined functions
        performUserDefinedActions(client, clientUserObj, item, executionID);

        //Only recurse if item is folder and if followChildItems is true
        if(item.type === "folder" && followChildItems) {
            processFolderItems(client, clientUserObj, item.id, executionID);
        }
    });

    return items.entries
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
    
    //Get list of enterprise users
    const userClient = sdk.getAppAuthClient('user', userID);

    //Try to get user info to test access and authorization before traversal
    try{
        const userInfo = await userClient.users.get(userClient.CURRENT_USER_ID)

        logger.info({
            label: "getUserItems",
            action: "RETREIVE_USER_INFO",
            executionId: executionID,
            message: `Successfully retreived user info for "${userName}" (${userID}) - Proceeding with traversal on folder "${startingFolderID}"`
        })
        
        processFolderItems(userClient, userInfo, startingFolderID, executionID, followChildItems, true);
    } catch(err) {
        logError(err, "getUserItems", `retreival of user info for user "${userName}" (${userID})`, executionID)
    }
}


/* index()
 * 
 * returns none
*/
async function index() {
    //Check if whitelist is enabled
    if(config.whitelist.enabled) {
        logger.info({
            label: "index",
            action: "WHITELIST",
            executionId: "N/A",
            message: `Preparing to iterate through whitelist`
        })

        //Loop through all items in whitelist
        for (let i in config.whitelist.items) {
            //Check if we should recurse through child items for this user's whitelist
            config.whitelist.items[i].folderIDs.forEach(function (folderID) {
                getUserItems(config.whitelist.items[i].ownerID, folderID, config.whitelist.items[i].followAllChildItems)
            });
        };
    } else { //Whitelist not enabled, perform actions on all users (honoring blacklist)
        //Get all enterprise users
        const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);

        for (let i in enterpriseUsers) {
            //Check if user is inncluded in blacklist
            if(config.blacklist.enabled && config.blacklist.users.includes(enterpriseUsers[i].id)) {
                //Log item then skip it
                logger.warn({
                    label: "index",
                    action: "IGNORE_USER",
                    executionId: "N/A",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) is included in configured blacklist - Ignoring`
                })

                continue;
            }

            const startingFolderID = '0';
            getUserItems(enterpriseUsers[i], startingFolderID)
        };
    }
}

logger.debug({
    label: "script root",
    action: "START",
    executionId: "N/A",
    message: `Starting index()`
});

// THIS IS WHERE THE MAGIC HAPPENS, PEOPLE
index()

logger.debug({
    label: "script root",
    action: "COMPLETE",
    executionId: "N/A",
    message: `index() completed`
});