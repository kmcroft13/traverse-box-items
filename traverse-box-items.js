/*
 * INTRODUCTION
 * This script will traverse all items in a Box instance while honoring 
 * configurations for an allowlist, denylist, or read from CSV.
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
//Require PQueue to control tasks
const PQueue = require('p-queue');
//Require fs and path modules
const fs = require('fs');
const path = require('path');
//Require core app source logic
const app = require('./src');
const { helpers, logger, csv, userCache } = app;
const actions = require('./user-defined-logic');

////  LOAD CONFIGURATIONS  ////////////////////////////////////////////////
const config = helpers.loadConfigs();

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

    logger.log.info({
        label: helpers.getFunctionName(),
        action: "PREPARE_FOLDER_INFO",
        executionId: parentExecutionID,
        message: `Getting info for folder ${folderID}`
    })

    //Generate unique executionID for this loop
    const executionID = helpers.generateExecutionId();

    let item;
    try {
        item = await userCache.getUser(ownerId).client.folders.get(folderID,
        {
            fields: config.boxItemFields
        })

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "RETRIEVE_FOLDER_INFO",
            executionId: executionID,
            message: `Retrieved info for folder ${folderID}`
        })

        if(item.metadata) {
            item["metadata"] = helpers.flattenMetadata(item["metadata"]);
        }

        if(config.auditTraversal) {
            logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added "performUserDefinedActions" task for ${item.type} "${item.id}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })
    
        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.logError(err, helpers.getFunctionName(), `Request for folder "${folderID}" rate limited -- Re-adding task to queue`, executionID);
            userCache.getUser(ownerId).queue.add( async function() { await getFolderInfo(ownerId, folderID, parentExecutionID) });
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added "getFolderInfo" task for folder "${folderID}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
            })
        } else {
            logger.logError(err, helpers.getFunctionName(), `retrieval of info for folder ${folderID} owned by ${userCache.getUser(ownerId).info.id}`, executionID);
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

    logger.log.info({
        label: helpers.getFunctionName(),
        action: "PREPARE_FILE_INFO",
        executionId: parentExecutionID,
        message: `Getting info for file ${fileID}`
    })

    //Generate unique executionID for this loop
    const executionID = helpers.generateExecutionId();

    let item;
    try {
        item = await userCache.getUser(ownerId).client.files.get(fileID,
        {
            fields: config.boxItemFields
        })

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "RETRIEVE_FILE_INFO",
            executionId: executionID,
            message: `Retrieved info for file ${fileID}`
        })

        if(item.metadata) {
            item["metadata"] = helpers.flattenMetadata(item["metadata"]);
        }

        if(config.auditTraversal) {
            logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added "performUserDefinedActions" task for ${item.type} "${item.id}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.logError(err, helpers.getFunctionName(), `Request for file "${fileID}" rate limited -- Re-adding task to queue`, executionID);
            userCache.getUser(ownerId).queue.add( async function() { await getFileInfo(ownerId, fileID, parentExecutionID) });
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added "getFileInfo" task for file "${fileID}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
            })
        } else {
            logger.logError(err, helpers.getFunctionName(), `retrieval of info for file ${fileID} owned by ${ownerId}`, executionID);
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

    logger.log.info({
        label: helpers.getFunctionName(),
        action: "PREPARE_WEBLINK_INFO",
        executionId: parentExecutionID,
        message: `Getting info for weblink ${weblinkID}`
    })

    //Generate unique executionID for this loop
    const executionID = helpers.generateExecutionId();

    let item;
    try {
        item = await userCache.getUser(ownerId).client.weblinks.get(weblinkID,
        {
            fields: config.boxItemFields
        })

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "RETRIEVE_WEBLINK_INFO",
            executionId: executionID,
            message: `Retrieved info for weblink ${weblinkID}`
        })

        if(item.metadata) {
            item["metadata"] = helpers.flattenMetadata(item["metadata"]);
        }

        if(config.auditTraversal) {
            logger.logAudit(
                "GET_ITEM", 
                item, 
                `Successfully retrieved item`, 
                executionID
            );
        }
    
        //PERFORM USER DEFINED ACTION(S) FOR THIS SPECIFIC OBJECT
        //Pass item object to user defined functions
        userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, item, executionID) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added "performUserDefinedActions" task for ${item.type} "${item.id}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })

        return item;
    } catch(err) {
        if(err.response && err.response.statusCode === 429) {
            logger.logError(err, helpers.getFunctionName(), `Request for weblink "${weblinkID}" rate limited -- Re-adding task to queue`, executionID);
            userCache.getUser(ownerId).queue.add( async function() { await getWeblinkInfo(ownerId, weblinkID, parentExecutionID) });
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added "getWeblinkInfo" task for weblink "${weblinkID}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
            })
        } else {
            logger.logError(err, helpers.getFunctionName(), `retrieval of info for weblink ${weblinkID} owned by ${ownerId}`, executionID);
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

            logger.log.info({
                label: helpers.getFunctionName(),
                action: "RETRIEVE_ENTERPRISE_USERS_PAGE",
                executionId: "N/A",
                message: `Retrieved ${allUsers.length} of ${totalCount} enterprise users`
            })
        }
        while(offset <= totalCount);

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "RETRIEVE_ENTERPRISE_USERS",
            executionId: "N/A",
            message: `Successfully retrieved all enterprise users`
        })
    } catch(err) {
        logger.logError(err, helpers.getFunctionName(), `Retrieval of enterprise users`, "N/A")
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
    let pageNum = 0;
    let folderItems;
    let allItems = [];
    let marker = 0;
    let limit = 1000;

    try {
        do {
            pageNum++;
            if (marker === 0) {
                folderItems = await userCache.getUser(ownerId).client.folders.getItems(folderID, {
                    fields: config.boxItemFields,
                    usemarker: true,
                    limit: limit
                });
            } else {
                folderItems = await userCache.getUser(ownerId).client.folders.getItems(folderID, {
                    fields: config.boxItemFields,
                    usemarker: true,
                    marker: marker,
                    limit: limit
                });
            }
            allItems = allItems.concat(folderItems.entries);
            marker = folderItems.next_marker;

            logger.log.info({
                label: helpers.getFunctionName(),
                action: "RETRIEVE_FOLDER_ITEMS_PAGE",
                executionId: parentExecutionID,
                message: `Retrieved page ${pageNum}. Total of ${allItems.length} items found for folder ${folderID}`
            })
        }
        while(folderItems.next_marker);

        if(folderID === '0') {
            logger.log.info({
                label: helpers.getFunctionName(),
                action: "RETRIEVE_ROOT_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} root items for "${userCache.getUser(ownerId).info.name}" (${userCache.getUser(ownerId).info.id})`
            })
        } else {
            logger.log.info({
                label: helpers.getFunctionName(),
                action: "RETRIEVE_CHILD_ITEMS",
                executionId: parentExecutionID,
                message: `Retrieved ${allItems.length} child items for folder ${folderID}`
            })
        }
    } catch(err) {
        //Need to throw error here so that it propogates up to next try/catch
        logger.logError(err, helpers.getFunctionName(), `Retrieval of child items for folder ${folderID} owned by ${userCache.getUser(ownerId).info.id}`, parentExecutionID);
        throw new Error(`Retrieval of child items for folder ${folderID} owned by ${userCache.getUser(ownerId).info.id} failed`);
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
 * returns [object] none
*/
async function processFolderItems(ownerId, folderID, parentExecutionID, followChildItems = true, firstIteration = false) {
    //Generate unique executionID for this loop
    const executionID = helpers.generateExecutionId();
    
    if(folderID === '0') {
        logger.log.info({
            label: helpers.getFunctionName(),
            action: "PREPARE_ROOT_ITEMS",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Beginning to traverse root items for "${userCache.getUser(ownerId).info.name}" (${userCache.getUser(ownerId).info.id})`
        })
    } else {
        logger.log.info({
            label: helpers.getFunctionName(),
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
        logger.logError(err, helpers.getFunctionName(), `Error retrieving folder items -- Re-adding task to queue`, executionID);
        userCache.getUser(ownerId).queue.add( async function() { await processFolderItems(ownerId, folderID, parentExecutionID, followChildItems, firstIteration) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added task to process items for folder ${folderID} | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })
        logger.log.warn({
            label: helpers.getFunctionName(),
            action: "KILL_TASK",
            executionId: executionID,
            message: `Stopping task due to propogated error`
        })

        return;
    }

    //If this is the first iteration and not the root folder, take action on starting folder itself
    //This only applies if using allowlist configuration!
    if(firstIteration && folderID !== '0') {
        userCache.getUser(ownerId).queue.add( async function() { await getFolderInfo(ownerId, folderID, executionID) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: `${executionID} | Parent: ${parentExecutionID}`,
            message: `Added task for folder ${folderID} | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })
    }

    for (let i in items) {
        //If getting root items, check if item is owned by the current user and if skip nonOwnedItems flag is true
        if(folderID === '0' && items[i].owned_by.id !== ownerId && config.nonOwnedItems.skip) {
            //Log item then skip it
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "IGNORE_NONOWNED_ITEM",
                executionId: executionID,
                message: `Skipping ${items[i].type} "${items[i].name}" (${items[i].id}) owned by ${items[i].owned_by.login} (${items[i].owned_by.id})`
            })

            if(config.nonOwnedItems.audit) {
                logger.logAudit(
                    "SKIP_ITEM", 
                    items[i], 
                    `Successfully retrieved skipped item`, 
                    executionID
                );
            }

            continue;
        }

        //If denylist is enabled and if folder is included in denylist
        if(items[i].type === "folder" && config.denylist.enabled && config.denylist.folders.includes(items[i].id)) {
            //Log item then skip it
            logger.log.warn({
                label: helpers.getFunctionName(),
                action: "IGNORE_DENYLIST_ITEM",
                executionId: executionID,
                message: `Folder "${items[i].name}" (${items[i].id}) is included in configured denylist - Ignoring`
            })

            continue;
        }

        if(items[i].metadata) {
            items[i]["metadata"] = helpers.flattenMetadata(items[i]["metadata"]);
        }

        if(config.auditTraversal) {
            logger.logAudit(
                "GET_ITEM", 
                items[i], 
                `Successfully retrieved item`, 
                executionID
            );
        }

        //PERFORM USER DEFINED ACTION(S)
        //Pass item object to user defined functions
        userCache.getUser(ownerId).queue.add( async function() { await actions.performUserDefinedActions(ownerId, items[i], executionID) });
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "ADD_TO_QUEUE",
            executionId: executionID,
            message: `Added "performUserDefinedActions" task for ${items[i].type} "${items[i].id}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
        })

        //Only recurse if item is folder and if followChildItems is true
        if(items[i].type === "folder" && followChildItems) {
            userCache.getUser(ownerId).queue.add( async function() { return await processFolderItems(ownerId, items[i].id, executionID) });
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added "processFolderItems" task for ${items[i].type} "${items[i].id}" | Queue ${ownerId} size: ${userCache.getUser(ownerId).queue.size}`
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
async function getUserItems(userId, startingFolderIDs, followChildItems = true) {
    //Generate a unique execution ID to track loop execution across functions
    const executionID = helpers.generateExecutionId();
    const itemCount = typeof startingFolderIDs === 'string' ? 1 : startingFolderIDs.length;

    logger.log.info({
        label: "getUserItems",
        action: "PREPARE_GET_ITEMS",
        executionId: executionID,
        message: `Preparing to get items for user ${userId} on ${itemCount === 1 ? `folder` : `folders`} "${startingFolderIDs}"`
    });
    
    //Establish BoxSDK client for user
    const userClient = sdk.getAppAuthClient('user', userId);

    //Try to get user info to test access and authorization before traversal
    try{
        const userInfo = await userClient.users.get(userClient.CURRENT_USER_ID)

        userCache.addUser(userInfo, userClient);

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "RETRIEVE_USER_INFO",
            executionId: executionID,
            message: `Successfully retrieved user info for "${userInfo.name}" (${userInfo.id})`
        })

        logger.log.info({
            label: helpers.getFunctionName(),
            action: "INITIALIZE_USER_TASK_QUEUE",
            executionId: userInfo.id,
            message: `Successfully initialized a task queue for "${userInfo.name}" (${userInfo.id})`
        })
        
        if(typeof startingFolderIDs === 'string') {
            userCache.getUser(userInfo.id).queue.add( async function() { return await processFolderItems(userInfo.id, startingFolderIDs, executionID, followChildItems, true) } );
            logger.log.info({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added task to process items for folder ${startingFolderIDs} | Queue ${userInfo.id} size: ${userCache.getUser(userInfo.id).queue.size}`
            });
        } else if(Array.isArray(startingFolderIDs)) {
            for (let folderID of startingFolderIDs) { 
                userCache.getUser(userInfo.id).queue.add( async function() { return await processFolderItems(userInfo.id, folderID, executionID, followChildItems, true) } );
                logger.log.debug({
                    label: helpers.getFunctionName(),
                    action: "ADD_TO_QUEUE",
                    executionId: executionID,
                    message: `Added task to process items for folder ${folderID} | Queue ${userInfo.id} size: ${userCache.getUser(userInfo.id).queue.size}`
                });
            }
            
            logger.log.info({
                label: helpers.getFunctionName(),
                action: "ADD_TO_QUEUE",
                executionId: executionID,
                message: `Added ${itemCount} ${itemCount === 1 ? `task` : `tasks` } to process items for ${itemCount === 1 ? `folder` : `folders`} ${startingFolderIDs} | Queue ${userInfo.id} size: ${userCache.getUser(userInfo.id).queue.size}`
            });
        }

        userCache.getUser(userInfo.id).queue.onIdle().then(async function() {
            userCache.getUser(userInfo.id).isProcessing = false;

            logger.log.info({
                label: helpers.getFunctionName(),
                action: "FINISHED_USER_TASK_QUEUE",
                executionId: userInfo.id,
                message: `All tasks processed for "${userInfo.name}" (${userInfo.id}) - Closing queue`
            });

            if(userCache.activeProcessingUsers().length === 0) {
                logger.log.info({
                    label: "COMPLETE",
                    action: "FINISHED_MASTER_TASK_QUEUE",
                    executionId: "N/A",
                    message: `All user queues have completed processing - Cleaning up`
                });

                if(config.auditReport.uploadToBox === true) {
                    logger.log.debug({
                        label: "CLEAN-UP",
                        action: "PREPARING_UPLOAD_REPORT_FILE",
                        executionId: "N/A",
                        message: `Preparing to upload audit report`
                    });

                    const reportFile = logger.getReportPath();
                    const fileSizeInBytes = fs.statSync(reportFile)["size"];
                    const stream = fs.createReadStream(reportFile);
    
                    let uploadedFile;
                    //Use chunked uploader if file is > 25MB
                    if (fileSizeInBytes > 26214400) {
                        const uploader = await serviceAccountClient.files.getChunkedUploader(config.auditReport.uploadFolderId, fileSizeInBytes, reportFile.split('/').pop(), stream);
                        uploadedFile = await uploader.start();
                    } else {
                        uploadedFile = await serviceAccountClient.files.uploadFile(config.auditReport.uploadFolderId, reportFile.split('/').pop(), stream);
                    }
    
                    const updatedFile = await serviceAccountClient.files.update(uploadedFile.entries[0].id, {shared_link: serviceAccountClient.accessLevels.DEFAULT});
                    const link = updatedFile.shared_link.url;
    
                    logger.log.info({
                        label: "CLEAN-UP",
                        action: "SUCCESS_UPLOAD_REPORT_FILE",
                        executionId: "N/A",
                        message: `A report file from this run can be found at: ${link}`
                    });
                } else {
                    logger.log.info({
                        label: "CLEAN-UP",
                        action: "AUDIT_LOG_FLUSH",
                        executionId: "N/A",
                        message: `A report file from this run can be found at ./${logger.getReportPath()}`
                    });
                }
            }
        });
    } catch(err) {
        logger.logError(err, helpers.getFunctionName(), `Retrieval of user info for user "${userId}"`, executionID)
    }
}


/* traverse()
 * 
 * returns none
*/
async function traverse() {

    //Check if allowlist is enabled
    if(config.csv.enabled) {
        logger.log.debug({
            label: helpers.getFunctionName(),
            action: "CSV_OPTION_ENABLED",
            executionId: "N/A",
            message: `CSV config option is enabled, proceeding with CSV based traversal`
        })

        //Attempt to read and parse CSV file
        const parsedCsv = csv.parseFile(config.csv.filePath);
        const headerValidationObj = csv.validateRow(0, parsedCsv[0]);

        if(!headerValidationObj.validationsPassed) {
            logger.log.error({
                label: helpers.getFunctionName(),
                action: "INCORRECT_HEADER",
                executionId: "N/A",
                message: `Could not parse CSV because of missing required header (${headerValidationObj.validationErrors.join(' , ')})`
            })
        } else {
            logger.log.debug({
                label: helpers.getFunctionName(),
                action: "HEADER_VALIDATIONS_PASSED",
                executionId: "N/A",
                message: `Header validations passed: ${headerValidationObj.validationsPassed}`
            })

            //Get all Enterprise users
            const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);
        
            for (const [index, row] of parsedCsv.entries()) {
                //Generate unique executionID for this loop
                const executionID = helpers.generateExecutionId();
                const rowValidationObj = csv.validateRow(index, row);

                if(!rowValidationObj.validationsPassed) {
                    logger.log.warn({
                        label: helpers.getFunctionName(),
                        action: "INCOMPLETE_ROW",
                        executionId: "N/A",
                        message: `Row ${index + 1} skipped because it is missing required information (${rowValidationObj.validationErrors.join(' , ')}): ${JSON.stringify(row)}`
                    })
                    continue;
                }

                const normalizedRow = csv.normalizeRow(index, row, rowValidationObj);

                //Continue with row processing
                const boxUser = enterpriseUsers.filter( user => user.login === normalizedRow.ownerLogin);

                //If user in inactive in Box
                if(!boxUser[0]) {
                    //Log user then skip it
                    logger.log.warn({
                        label: helpers.getFunctionName(),
                        action: "USER_NOT_FOUND",
                        executionId: executionID,
                        message: `CSV ROW ${index + 1}: User "${normalizedRow.ownerLogin}" was inaccessible or not found in Box instance`
                    })

                    continue;
                } else if(boxUser[0].status !== "active") {
                    //Log user then skip it
                    logger.log.warn({
                        label: helpers.getFunctionName(),
                        action: "NON_ACTIVE_USER",
                        executionId: executionID,
                        message: `CSV ROW ${index + 1}: User "${boxUser[0].name}" (${boxUser[0].id}) has a non-active status - Ignoring ${row.type} ${row.item_id}`
                    })

                    continue;
                };
        
                logger.log.info({
                    label: helpers.getFunctionName(),
                    action: "PARSE_CSV_ROW",
                    executionId: executionID,
                    message: `PARSING CSV ROW ${index + 1}: Identified ${normalizedRow.type} "${normalizedRow.itemId}" owned by ${normalizedRow.ownerLogin}`
                })
        
                const userClient = sdk.getAppAuthClient('user', boxUser[0].id);
        
                if (!userCache.checkUser(boxUser[0].id)) {
                    userCache.addUser(boxUser[0], userClient);

                    logger.log.info({
                        label: helpers.getFunctionName(),
                        action: "INITIALIZE_TASK_QUEUE",
                        executionId: boxUser[0].id,
                        message: `Successfully initialized a task queue for "${boxUser[0].name}" (${boxUser[0].id})`
                    })
                }

                if(normalizedRow.type === "file") {
                    userCache.getUser(boxUser[0].id).queue.add( async function() { await getFileInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    logger.log.debug({
                        label: helpers.getFunctionName(),
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${userCache.getUser(boxUser[0].id).queue.size}`
                    })
                } else if(normalizedRow.type === "folder") {
                    userCache.getUser(boxUser[0].id).queue.add( async function() { await getFolderInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    logger.log.debug({
                        label: helpers.getFunctionName(),
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${userCache.getUser(boxUser[0].id).queue.size}`
                    })
                } else if(normalizedRow.type === "web_link") {
                    userCache.getUser(boxUser[0].id).queue.add( async function() { await getWeblinkInfo(boxUser[0].id, normalizedRow.itemId, executionID) });
                    logger.log.debug({
                        label: helpers.getFunctionName(),
                        action: "ADD_TO_QUEUE",
                        executionId: executionID,
                        message: `PARSED CSV ROW ${index + 1}: Added task for ${normalizedRow.type} ${normalizedRow.itemId} | Queue ${boxUser[0].id} size: ${userCache.getUser(boxUser[0].id).queue.size}`
                    })
                }
            }
        }

    } else if(config.allowlist.enabled) {
        logger.log.info({
            label: helpers.getFunctionName(),
            action: "ALLOWLIST",
            executionId: "N/A   ",
            message: `Preparing to iterate through allowlist`
        })

        for (let i in config.allowlist.items) {
            //Check if we should recurse through child items for this user's allowlist
            usersTaskQueue.add( async function() { await getUserItems(config.allowlist.items[i].ownerID, config.allowlist.items[i].folderIDs, config.allowlist.items[i].followAllChildItems) });
            logger.log.info({
                label: helpers.getFunctionName(),
                action: "CREATED_TRAVERSAL_TASK",
                executionId: "N/A   ",
                message: `Created a traversal task for ${config.allowlist.items[i].folderIDs.length === 1 ? `folder` : `folders`} "${config.allowlist.items[i].folderIDs}" owned by "${config.allowlist.items[i].ownerID}" | Users task queue size: ${usersTaskQueue.size}`
            });
        }

    } else { //Allowlist not enabled, perform actions on all users (honoring denylist)
        //Get all enterprise users
        const enterpriseUsers = await getEnterpriseUsers(serviceAccountClient);

        for (let i in enterpriseUsers) {
            //Check if user is included in denylist
            if(config.denylist.enabled && config.denylist.users.includes(enterpriseUsers[i].id)) {
                //Log item then skip it
                logger.log.warn({
                    label: helpers.getFunctionName(),
                    action: "IGNORE_USER",
                    executionId: "N/A   ",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) is included in configured denylist - Ignoring`
                });

                continue;
            }

            //If user in inactive in Box
            if(enterpriseUsers[i].status !== "active") {
                //Log user then skip it
                logger.log.warn({
                    label: helpers.getFunctionName(),
                    action: "NON_ACTIVE_USER",
                    executionId: "N/A",
                    message: `User "${enterpriseUsers[i].name}" (${enterpriseUsers[i].id}) has a non-active status - Ignoring`
                })

                continue;
            };

            usersTaskQueue.add( async function() { await getUserItems(enterpriseUsers[i].id, '0') });
            logger.log.info({
                label: helpers.getFunctionName(),
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

    logger.log.info({
        label: helpers.getFunctionName(),
        action: "BEGIN_INITIALIZE_TRAVERSAL_TASKS",
        executionId: "N/A",
        message: `Preparing to create traverse tasks for all items`
    })

    await logger.buildAuditLogger();
    await traverse();

    logger.log.info({
        label: helpers.getFunctionName(),
        action: "END_INITIALIZE_TRAVERSAL_TASKS",
        executionId: "N/A",
        message: `All traverse tasks have been created and are pending completion`
    })
}

// Check for incompatible configurations
if(config.allowlist.enabled && config.denylist.enabled && config.denylist.users) {
    console.log('\n\n=============== WARNING ===============\nDenylist users are ignored when both denylist and allowlist are enabled together. Continuing automatically in 10 seconds...\n=======================================\n\n');
    setTimeout(function () {
        index();
    }, 10000)
} else {
    // THIS IS WHERE THE MAGIC HAPPENS, PEOPLE
    index();
}