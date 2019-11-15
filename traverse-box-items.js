/*
 * INTRODUCTION
 * This script will traverse all items in a Box instance while honoring 
 * configurations for a whitelist, blacklist, or read from CSV.
 * 
 * It also exposes a "performUserDefinedActions" function which allows for
 * custom business logic to be performed on each item retreived during traversal.
 * 
 * All custom business logic should be defined in 
 * the user-defined-logic.js file.
*/

////  USER DEFINED LOGIC  /////////////////////////////////////////////////
// Find examples of user defined business logic at: https://github.com/kmcroft13/traverse-box-items/tree/master/User%20Defined%20Logic%20Examples

///////////////////////////////////////////////////////////////////////////


////  LOAD MODULES  ///////////////////////////////////////////////////////
// Require module for Box SDK
const BoxSDK = require('box-node-sdk');
//Require node fs module
const fs = require('fs');
//Require PQueue to control tasks
const PQueue = require('p-queue');
//Require core app source logic
const app = require('./src');
const actions = require('./user-defined-logic');

//eval(fs.readFileSync('user-defined-logic.js')+'');

//Initialize user cache
//const userCache = {};

////  LOAD CONFIGURATIONS  ////////////////////////////////////////////////
const config = app.config.loadConfigs();

// Initialize the Box SDK from config file
const sdk = new BoxSDK({
  clientID: config.boxAppSettings.clientID,
  clientSecret: config.boxAppSettings.clientSecret,
  appAuth: config.boxAppSettings.appAuth,
  enterpriseID: config.boxAppSettings.enterpriseID,
  request: { strictSSL: true }
});
///////////////////////////////////////////////////////////////////////////


////  CREATE BOX API CLIENTS  /////////////////////////////////////////////
//Service Account user
const serviceAccountClient = sdk.getAppAuthClient('enterprise', config.enterpriseId);
///////////////////////////////////////////////////////////////////////////

////  CREATE USERS TASK QUEUE  ////////////////////////////////////////////
const usersTaskQueue = new PQueue({concurrency: config.maxConcurrentUsers});
///////////////////////////////////////////////////////////////////////////


////  CORE BUSINESS LOGIC  ////////////////////////////////////////////////

/* getFolderInfo()
 * param [string] ownerId: User ID for the user who owns the item
 * param [string] folderID: Folder ID to get info on
 * param [string] parentExecutionID: Unique ID associated with a given execution loop
 * 
 * returns [object] Box folder object for given folder ID
*/
async function getFolderInfo(ownerId, folderID, parentExecutionID) {

    app.logger.log.info({
        label: "getFolderInfo",
        action: "PREPARE_FOLDER_INFO",
        executionId: parentExecutionID,
        message: `Getting info for folder ${folderID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await app.userCache.getUser(ownerId).client.folders.get(folderID,
        {
            fields: config.boxItemFields
        })

        app.logger.log.info({
            label: "getFolderInfo",
            action: "RETRIEVE_FOLDER_INFO",
            executionId: executionID,
            message: `Retrieved info for folder ${folderID}`
        })

        if(config.auditTraversal) {
            app.logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        app.userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        app.logger.log.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            app.logger.logError(err, "getFolderInfo", `Request for folder "${folderID}" rate limited -- Re-adding task to queue`, executionID);
            app.userCache.getUser(ownerId).queue.add( async function() { await getFolderInfo(ownerId, folderID, parentExecutionID) });
            app.logger.log.debug({
                label: "getFolderInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for folder ${folderID} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
            })
        } else {
            app.logger.logError(err, "getFolderInfo", `retrieval of info for folder ${folderID} owned by ${app.userCache.getUser(ownerId).info.id}`, executionID);
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

    app.logger.log.info({
        label: "getFileInfo",
        action: "PREPARE_FILE_INFO",
        executionId: parentExecutionID,
        message: `Getting info for file ${fileID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await app.userCache.getUser(ownerId).client.files.get(fileID,
        {
            fields: config.boxItemFields
        })

        app.logger.log.info({
            label: "getFileInfo",
            action: "RETRIEVE_FILE_INFO",
            executionId: executionID,
            message: `Retrieved info for file ${fileID}`
        })

        if(config.auditTraversal) {
            app.logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        app.userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        app.logger.log.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            app.logger.logError(err, "getFileInfo", `Request for file "${fileID}" rate limited -- Re-adding task to queue`, executionID);
            app.userCache.getUser(ownerId).queue.add( async function() { await getFileInfo(ownerId, fileID, parentExecutionID) });
            app.logger.log.debug({
                label: "getFileInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for file ${fileID} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
            })
        } else {
            app.logger.logError(err, "getFileInfo", `retrieval of info for file ${fileID} owned by ${ownerId}`, executionID);
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

    app.logger.log.info({
        label: "getWeblinkInfo",
        action: "PREPARE_WEBLINK_INFO",
        executionId: parentExecutionID,
        message: `Getting info for weblink ${weblinkID}`
    })

    //Generate unique executionID for this loop
    const executionID = (Math.random()* 1e20).toString(36)

    let item;
    try {
        item = await app.userCache.getUser(ownerId).client.weblinks.get(weblinkID,
        {
            fields: config.boxItemFields
        })

        app.logger.log.info({
            label: "getWeblinkInfo",
            action: "RETRIEVE_WEBLINK_INFO",
            executionId: executionID,
            message: `Retrieved info for weblink ${weblinkID}`
        })

        if(config.auditTraversal) {
            app.logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        app.userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        app.logger.log.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${item.type} ${item.id} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            app.logger.logError(err, "getWeblinkInfo", `Request for weblink "${weblinkID}" rate limited -- Re-adding task to queue`, executionID);
            app.userCache.getUser(ownerId).queue.add( async function() { await getWeblinkInfo(ownerId, weblinkID, parentExecutionID) });
            app.logger.log.debug({
                label: "getWeblinkInfo",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task for weblink ${weblinkID} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
            })
        } else {
            app.logger.logError(err, "getWeblinkInfo", `retrieval of info for weblink ${weblinkID} owned by ${ownerId}`, executionID);
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

            app.logger.log.info({
                label: "getEnterpriseUsers",
                action: "RETRIEVE_ENTERPRISE_USERS_PAGE",
                executionId: "N/A",
                message: `Retrieved ${allUsers.length} of ${totalCount} enterprise users`
            })
        }
        while(offset <= totalCount);

        app.logger.log.info({
            label: "getEnterpriseUsers",
            action: "RETRIEVE_ENTERPRISE_USERS",
            executionId: "N/A",
            message: `Successfully retrieved all enterprise users`
        })
    } catch(err) {
        app.logger.logError(err, "getEnterpriseUsers", `Retrieval of enterprise users`, "N/A")
    }
    
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
            folderItems = await app.userCache.getUser(ownerId).client.folders.getItems(folderID, {
                fields: config.boxItemFields,
                offset: offset,
                limit: 1000
            });
            
            allItems = allItems.concat(folderItems.entries);
            offset = folderItems.offset + folderItems.limit;
            totalCount = folderItems.total_count;

            app.logger.log.info({
                label: "getFolderItems",
                action: "RETRIEVE_FOLDER_ITEMS_PAGE",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} items from folder ${folderID}`
            })
        }
        while(offset <= totalCount);

        if(folderID === '0') {
            app.logger.log.info({
                label: "getFolderItems",
                action: "RETRIEVE_ROOT_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} root items for "${app.userCache.getUser(ownerId).info.name}" (${app.userCache.getUser(ownerId).info.id})`
            })
        } else {
            app.logger.log.info({
                label: "getFolderItems",
                action: "RETRIEVE_CHILD_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} of ${totalCount} child items for folder ${folderID}`
            })
        }
    } catch(err) {
        //Need to throw error here so that it propogates up to next try/catch
        app.logger.logError(err, "getFolderItems", `Retrieval of child items for folder ${folderID} owned by ${app.userCache.getUser(ownerId).info.id}`, parentExecutionID);
        throw new Error(`Retrieval of child items for folder ${folderID} owned by ${app.userCache.getUser(ownerId).info.id} failed`);
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
        app.logger.log.info({
            label: "processFolderItems",
            action: "PREPARE_ROOT_ITEMS",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Beginning to traverse root items for "${app.userCache.getUser(ownerId).info.name}" (${app.userCache.getUser(ownerId).info.id})`
        })
    } else {
        app.logger.log.info({
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
        app.logger.logError(err, "processFolderItems", `Error retrieving folder items -- Re-adding task to queue`, executionID);
        app.userCache.getUser(ownerId).queue.add( async function() { await processFolderItems(ownerId, folderID, parentExecutionID, followChildItems, firstIteration) });
        app.logger.log.debug({
            label: "processFolderItems",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task to process items for folder ${folderID} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })
        app.logger.log.warn({
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
        app.userCache.getUser(ownerId).queue.add( async function() { await getFolderInfo(ownerId, folderID, executionID) });
        app.logger.log.debug({
            label: "getFolderInfo",
            action: "ADD_TO_QUEUE",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Added task for folder ${folderID} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })
    }

    for (let i in items) {
        //If getting root items, check if item is owned by the current user and if skip nonOwnedItems flag is true
        if(folderID === '0' && items[i].owned_by.id !== ownerId && config.nonOwnedItems.skip) {
            //Log item then skip it
            app.logger.log.debug({
                label: "processFolderItems",
                action: "IGNORE_NONOWNED_ITEM",
                executionId: executionID,
                message: `Skipping ${items[i].type} "${items[i].name}" (${items[i].id}) owned by ${items[i].owned_by.login} (${items[i].owned_by.id})`
            })

            if(config.nonOwnedItems.audit) {
                app.logger.logAudit(
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
            app.logger.log.warn({
                label: "processFolderItems",
                action: "IGNORE_BLACKLIST_ITEM",
                executionId: executionID,
                message: `Folder "${items[i].name}" (${items[i].id}) is included in configured blacklist - Ignoring`
            })

            continue;
        }

        if(config.auditTraversal) {
            app.logger.logAudit(
                "GET_ITEM", 
                items[i], 
                `Successfully retrieved item`, 
                executionID
            );
        }

        //PERFORM USER DEFINED ACTION(S)
        //Pass item object to user defined functions
        app.userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, items[i], executionID) });
        app.logger.log.debug({
            label: "performUserDefinedActions",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task for ${items[i].type} ${items[i].id} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
        })

        //Only recurse if item is folder and if followChildItems is true
        if(items[i].type === "folder" && followChildItems) {
            app.userCache.getUser(ownerId).queue.add( async function() { return await processFolderItems(ownerId, items[i].id, executionID) });
            app.logger.log.debug({
                label: "processFolderItems",
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task to process items for ${items[i].type} ${items[i].id} | Queue ${ownerId} size: ${app.userCache.getUser(ownerId).queue.size}`
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

    app.logger.log.info({
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

        app.userCache.addUser(userInfo, userClient);

        app.logger.log.info({
            label: "getUserItems",
            action: "RETRIEVE_USER_INFO",
            executionId: executionID,
            message: `Successfully retrieved user info for "${userInfo.name}" (${userInfo.id})`
        })

        app.logger.log.info({
            label: "traverse",
            action: "INITIALIZE_TASK_QUEUE",
            executionId: userInfo.id,
            message: `Successfully initialized a task queue for "${userInfo.name}" (${userInfo.id})`
        })
        
        app.userCache.getUser(userInfo.id).queue.add( async function() { return await processFolderItems(userInfo.id, startingFolderID, executionID, followChildItems, true) } );
        app.logger.log.debug({
            label: "processFolderItems",
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task to process items for folder ${startingFolderID} | Queue ${userInfo.id} size: ${app.userCache.getUser(userInfo.id).queue.size}`
        })

        app.userCache.getUser(userInfo.id).queue.onIdle().then(() => {
            app.logger.log.info({
                label: "traverse",
                action: "FINISHED_TASK_QUEUE",
                executionId: userInfo.id,
                message: `All tasks processed for "${userInfo.name}" (${userInfo.id}) - Closing queue`
            })
        });
    } catch(err) {
        app.logger.logError(err, "getUserItems", `Retrieval of user info for user "${userId}"`, executionID)
    }
}


/* traverse()
 * 
 * returns none
*/
async function traverse() {

    //Check if whitelist is enabled
    if(config.csv.enabled) {
        app.logger.log.debug({
            label: "traverse",
            action: "CSV_OPTION_ENABLED",
            executionId: "N/A",
            message: `CSV config option is enabled, proceeding with CSV based traversal.`
        })

        //Attempt to read and parse CSV file
        const parsedCsv = app.csv.parseFile(config.csv.filePath);
        const headerValidationObj = app.csv.validateRow(0, parsedCsv[0]);

        if(!headerValidationObj.validationsPassed) {
            app.logger.log.error({
                label: "traverse",
                action: "INCORRECT_HEADER",
                executionId: "N/A",
                message: `Could not parse CSV because of missing required header (${headerValidationObj.validationErrors.join(' , ')})`
            })
        } else {
            app.logger.log.debug({
                label: "traverse",
                action: "HEADER_VALIDATIONS_PASSED",
                executionId: "N/A",
                message: `Header validations passed: ${headerValidationObj.validationsPassed}`
            })

            //Get all Enterprise users
            const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);
        
            for (const [index, row] of parsedCsv.entries()) {
                //Generate unique executionID for this loop
                const executionID = (Math.random()* 1e20).toString(36);

                const rowValidationObj = app.csv.validateRow(index, row);

                if(!rowValidationObj.validationsPassed) {
                    app.logger.log.warn({
                        label: "traverse",
                        action: "INCOMPLETE_ROW",
                        executionId: "N/A",
                        message: `Row ${index + 1} skipped because it is missing required information (${rowValidationObj.validationErrors.join(' , ')}): ${JSON.stringify(row)}`
                    })
                    continue;
                }

                const normalizedRow = app.csv.normalizeRow(index, row, rowValidationObj);

                //Continue with row processing
                const boxUser = enterpriseUsers.filter( user => user.login === normalizedRow.ownerLogin);

                //If user in inactive in Box
                if(!boxUser[0]) {
                    //Log user then skip it
                    app.logger.log.warn({
                        label: "traverse",
                        action: "USER_NOT_FOUND",
                        executionId: executionID,
                        message: `CSV ROW ${index + 1}: User "${normalizedRow.ownerLogin}" was inaccessible or not found in Box instance`
                    })

                    continue;
                } else if(boxUser[0].status !== "active") {
                    //Log user then skip it
                    app.logger.log.warn({
                        label: "traverse",
                        action: "NON_ACTIVE_USER",
                        executionId: executionID,
                        message: `CSV ROW ${index + 1}: User "${boxUser[0].name}" (${boxUser[0].id}) has a non-active status - Ignoring ${row.type} ${row.item_id}`
                    })

                    continue;
                };
        
                app.logger.log.info({
                    label: "traverse",
                    action: "PARSE_CSV_ROW",
                    executionId: executionID,
                    message: `PARSING CSV ROW ${index + 1}: Identified ${normalizedRow.type} "${normalizedRow.itemId}" owned by ${normalizedRow.ownerLogin}`
                })
        
                const userClient = sdk.getAppAuthClient('user', boxUser[0].id);
        
                if (!app.userCache.checkUser(boxUser[0].id)) {
                    app.userCache.addUser(boxUser[0], userClient);

                    app.logger.log.info({
                        label: "traverse",
                        action: "INITIALIZE_TASK_QUEUE",
                        executionId: boxUser[0].id,
                        message: `Successfully initialized a task queue for "${boxUser[0].name}" (${boxUser[0].id})`
                    })
                }

                if(normalizedRow.type === "file") {
                    app.userCache.getUser(boxUser[0].id).queue.add( async function() { await getFileInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    app.logger.log.debug({
                        label: "traverse",
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${app.userCache.getUser(boxUser[0].id).queue.size}`
                    })
                } else if(normalizedRow.type === "folder") {
                    app.userCache.getUser(boxUser[0].id).queue.add( async function() { await getFolderInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    app.logger.log.debug({
                        label: "traverse",
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${app.userCache.getUser(boxUser[0].id).queue.size}`
                    })
                } else if(normalizedRow.type === "web_link") {
                    app.userCache.getUser(boxUser[0].id).queue.add( async function() { await getWeblinkInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    app.logger.log.debug({
                        label: "traverse",
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${app.userCache.getUser(boxUser[0].id).queue.size}`
                    })
                }
            }
        }

    } else if(config.whitelist.enabled) {
        app.logger.log.info({
            label: "traverse",
            action: "WHITELIST",
            executionId: "N/A",
            message: `Preparing to iterate through whitelist`
        })

        for (let i in config.whitelist.items) {
            //Check if we should recurse through child items for this user's whitelist
            for (let folderID in config.whitelist.items[i].folderIDs) {
                usersTaskQueue.add( async function() { await getUserItems(config.whitelist.items[i].ownerID, folderID, config.whitelist.items[i].followAllChildItems) });
                app.logger.log.info({
                    label: "traverse",
                    action: "CREATED_TRAVERSAL_TASK",
                    executionId: "N/A",
                    message: `Created a traversal task for folder ${folderId} owned by ${config.whitelist.items[i].ownerID}) | Users task queue size: ${usersTaskQueue.size}`
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
                app.logger.log.warn({
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
                app.logger.log.warn({
                    label: "traverse",
                    action: "NON_ACTIVE_USER",
                    executionId: "N/A",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) has a non-active status - Ignoring`
                })

                continue;
            };

            usersTaskQueue.add( async function() { await getUserItems(enterpriseUsers[i].id, '0') });
            app.logger.log.info({
                label: "traverse",
                action: "CREATED_TRAVERSAL_TASK",
                executionId: "N/A",
                message: `Created a traversal task for user "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) | Users task queue size: ${usersTaskQueue.size}`
            })
        };
    }
}


/* index()
 * returns none
*/
async function index() {

    app.logger.log.info({
        label: "index",
        action: "INITIALIZE_TRAVERSAL_TASKS",
        executionId: "N/A",
        message: `Preparing to create traverse tasks for all items`
    })

    await traverse();

    app.logger.log.info({
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