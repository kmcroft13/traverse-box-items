//Require modules from Winston (logging utility)
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;
//Require node fs and path modules
const fs = require('fs');
const path = require('path');

//Load script configs
const helpers = require('./helpers');
const config = helpers.loadConfigs();

////  CONSTANTS  //////////////////////////////////////////////////////////
const runtimeLogsPath = './runtimeLogs';
const auditLogsPath = './auditLogs';

////  INITIALIZE LOGGING  /////////////////////////////////////////////////
if (!fs.existsSync(runtimeLogsPath)){
    fs.mkdirSync(runtimeLogsPath);
}
if (!fs.existsSync(auditLogsPath)){
    fs.mkdirSync(auditLogsPath);
}

const logFormat = printf(info => {
  return `${info.timestamp}\t${info.level}\t${info.executionId}\t${info.label}\t${info.action}\t${info.message}\t${info.errorDetails ? `\t${info.errorDetails}` : ``}`;
});

const actionFormat = printf(info => {
    return `${info.time ? `"${info.time}` : `"${info.timestamp}`}","${info.label}","${info.executionId}","${info.itemID}","${info.itemName}","${info.itemType}","${info.ownedByEmail}","${info.ownedByID}","${info.pathByNames}","${info.pathByIDs}","${info.itemCreatedAt}","${info.modifiedAt}","${info.size}","${info.sharedLink}","${info.sharedLinkAccess}","${info.message}"`;
  });

const customLogLevels = {
    levels: {
        action: 0
    }
  };

const log = createLogger({
    format: combine(
        format(info => {
            info.level = info.level.toUpperCase()
            info.action = info.action.toUpperCase()
            return info;
        })(),
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console({ 
            level: 'debug',
            format: combine(
                format(info => {
                    info.level = info.level.toUpperCase()
                    info.action = info.action.toUpperCase()
                    return info;
                })(),
                colorize(),
                timestamp(),
                logFormat
            ),
        }),
        new transports.File({ filename: path.join(runtimeLogsPath, '/scriptLog-error.log'), level: 'error' }),
        new transports.File({ filename: path.join(runtimeLogsPath, '/scriptLog-combined.log'), level: config.logLevel || 'info' })
    ],
    exceptionHandlers: [
        new transports.Console(),
        new transports.File({ filename: path.join(runtimeLogsPath, '/scriptLog-exceptions.log') })
    ]
});

const d = new Date();
const datestring = ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + "-" + d.getFullYear() + "_" + ("0" + d.getHours()).slice(-2) + "-" + ("0" + d.getMinutes()).slice(-2);
const auditor = createLogger({
    format: combine(
        format(info => {
            info.level = info.level.toUpperCase()
            return info;
        })(),
        timestamp(),
        actionFormat
    ),
    levels: customLogLevels.levels,
    transports: [
        new transports.File({ filename: path.join(auditLogsPath, `/${datestring}_Results.csv`), level: 'action' })
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


////  HELPER FUNCTIONS  ///////////////////////////////////////////////////


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


/* logError()
 * param [object] err: Error object returned from catch
 * param [string] functionName: NAme of the function which originated the error
 * param [string] failedEvent: Description of the action which failed
 * param [string] executionID: Unique ID associated with a given execution loop
 * 
 * returns none
*/
const logError = function(err, functionName, failedEvent, executionID) {
    if(err.response) {
        if(err.response.statusCode === 429) {
            log.warn({
                label: functionName,
                action: "BOX_RATE_LIMITED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body.code) {
            log.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body.error) {
            log.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.error} | Message: ${err.response.body.error_description}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else {
            log.error({
                label: functionName,
                action: "REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode}`,
                errorDetails: JSON.stringify(err.response)
            });
        }
    } else {
        log.error({
            label: functionName,
            action: "UNKNOWN_ERROR",
            executionId: executionID,
            message: failedEvent,
            errorDetails: err.stack
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
const logAudit = function(action, boxItemObj, message, executionID) {
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

module.exports = { log, logAudit, logError };