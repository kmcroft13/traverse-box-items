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
let reportFile = "";

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

const log = createLogger({
    format: combine(
        format(info => {
            info.level ? info.level = info.level.toUpperCase() : 'ERROR'
            info.action ? info.action = info.action.toUpperCase() : 'UNHANDLED_EXCEPTION'
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
                    info.level ? info.level = info.level.toUpperCase() : 'ERROR'
                    info.action ? info.action = info.action.toUpperCase() : 'UNHANDLED_EXCEPTION'
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
        new transports.File({ filename: path.join(runtimeLogsPath, '/scriptLog-exceptions.log'), handleExceptions: true, handleRejections: true })
    ]
});

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
})

let auditor;
async function buildAuditLogger() {

    let headerObj = {
        timestamp: "TIMESTAMP",
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
        sharedLink: "ITEM_LINK",
        sharedLinkAccess: "LINK_ACCESS_LEVEL",
        size: "ITEM_SIZE_BYTES",
    };


    //If metadata is being retrieved, dynamically add it to audit object
    let metadataField = config.boxItemFields.split(',');
    metadataField = metadataField.find(field => field.includes("metadata"));
    if(metadataField) {
        // Require module for Box SDK
        const BoxSDK = require('box-node-sdk');
        const sdk = new BoxSDK({
            clientID: config.boxAppSettings.clientID,
            clientSecret: config.boxAppSettings.clientSecret,
            appAuth: config.boxAppSettings.appAuth,
            enterpriseID: config.boxAppSettings.enterpriseID,
            request: { strictSSL: true }
        });
        const serviceAccountClient = sdk.getAppAuthClient('enterprise', config.enterpriseId);
    
        metadataField = metadataField.replace("metadata.","");
        const [ mdScope, mdTemplate ] = metadataField.split('.');
        const mdSchema = await serviceAccountClient.metadata.getTemplateSchema(mdScope, mdTemplate);
        
        mdSchema.fields.forEach(field => {
            headerObj[field.key] = field.displayName.toUpperCase().replace(/ /g,'_').replace(/"/g,'""');
        })

    }
    
    //Add details as last column
    headerObj["message"] = "DETAILS";

    //Build audit CSV row format
    const actionFormat = printf(info => {
        let loggerString = [];
        Object.keys(headerObj).forEach( key => loggerString.push(info[key]));
        loggerString = loggerString.join('","');

        return `"${loggerString}"`;
    });
    
    const customLogLevels = {
        levels: {
            action: 0
        }
    };
    const d = new Date();
    const datestring = ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + "-" + d.getFullYear() + "_" + ("0" + d.getHours()).slice(-2) + "-" + ("0" + d.getMinutes()).slice(-2);
    reportFile = path.join(auditLogsPath, `/${datestring}_Results.csv`);

    const audit = createLogger({
        format: combine(
            format(info => {
                delete info.level;
                return info;
            })(),
            timestamp(),
            actionFormat
        ),
        levels: customLogLevels.levels,
        transports: [
            new transports.File({ filename: reportFile, level: 'action' })
        ]
    });

    //Workaround to create "header" row in Results log file
    audit.action(headerObj);
    auditor = audit;
    return true;
}

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

/**
 * Prepares audit log messages for CSV format
 * @param   {string} message: Message passed to the logAudit function
 * @returns {string} A sanizied audit log message
*/
function sanitizeAuditLogMessage(message) {
    return message.replace(/"/g,'""');
}


function getReportPath() {
    return reportFile;
}


/**
 * Logs an error entry to runtime logs
 * @param  {Object} err Error object returned from catch
 * @param  {String} functionName Name of the function which originated the error
 * @param  {String} failedEvent Description of the action which failed
 * @param  {String} executionID Unique ID associated with a given execution loop
 * @return {None}   Nothing returned by this function
 */
const logError = (err, functionName, failedEvent, executionID) => {
    if(err.response) {
        if(err.response.statusCode === 429) {
            log.warn({
                label: functionName,
                action: "BOX_RATE_LIMITED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body && err.response.body.code) {
            log.error({
                label: functionName,
                action: "BOX_REQUEST_FAILED",
                executionId: executionID,
                message: `${failedEvent} | Status: ${err.response.statusCode} | Code: ${err.response.body.code} | Message: ${err.response.body.message}`,
                errorDetails: JSON.stringify(err.response)
            });
        } else if(err.response.body && err.response.body.error) {
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


/**
 * Logs an audit entry to the audit CSV
 * @param  {String} action Action that is being audited
 * @param  {Object} boxItemObj Box item object (folder, file, web_link)
 * @param  {String} message Additional details about the event
 * @param  {String} executionID Unique ID associated with a given execution loop
 * @return {None}   Nothing returned by this function
 */
const logAudit = (action, boxItemObj, message, executionID) => {
    let auditorObj = {
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
        message: sanitizeAuditLogMessage(message)
    };

    //If metadata is available, dynamically add it to audit object
    if(boxItemObj.metadata) {
        try{
            if(JSON.stringify(boxItemObj.metadata).includes("$id")) {
                boxItemObj.metadata = JSON.stringify(boxItemObj.metadata).substring(1);
                boxItemObj.metadata = boxItemObj.metadata.split(/(?:,"\$id":)+/)[0];
                boxItemObj.metadata = JSON.parse(`{${boxItemObj.metadata}}`);
            }
            boxItemObj.metadata = Object.keys(boxItemObj.metadata).reduce((newObj, key) => {newObj[key] = boxItemObj.metadata[key].replace(/"/g,'""'); return newObj; }, {});
            for(var key in boxItemObj.metadata) {
                auditorObj[key] = boxItemObj.metadata[key];
            }
        } catch(err) {
            logError(
                err,
                "logger",
                `Failed to log ${boxItemObj.type} "${boxItemObj.id}" with metadata: ${JSON.stringify(boxItemObj.metadata)}`,
                executionID
            );
        }
    }

    auditor.action(auditorObj);
}
///////////////////////////////////////////////////////////////////////////

module.exports = { log, logAudit, logError, buildAuditLogger, getReportPath };