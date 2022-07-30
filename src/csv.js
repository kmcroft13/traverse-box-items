//Require modules from 'node-csv' (CSV parser)
const parse = require('csv-parse/lib/sync');
////  LOAD MODULES  ///////////////////////////////////////////////////////
const logger = require('./logger');
const fs = require('fs');

const parseFile = function(filePath) {
    //Read wave analysis CSV
    let rawCsv;
    try {
        rawCsv = fs.readFileSync(filePath, 'utf8');
    } catch(err) {
        logger.logError(err, "csv/parseFile", `Error reading CSV file from "${filePath}"`, "N/A");
    }
    
    //Parse wave analysis CSV to JSON
    let csv;
    try {
        //Read wave analysis CSV
        csv = parse(rawCsv, {columns: true, skip_empty_lines: true, skip_records_with_empty_values: true});
    } catch(err) {
        logger.logError(err, "csv/parseFile", `Error parsing CSV file object`, "N/A");
    }

    return csv;
};

const validateRow = function(index, row) {
    const rowValidation = {
        validationsPassed: false,
        validationErrors: [],
        ownerLogin: {
            exists: null,
            key: null
        },
        itemId: {
            exists: null,
            key: null
        },
        type: {
            exists: null,
            key: null
        }
    };
    
    if(row.hasOwnProperty('owner_login') && row['owner_login'] != "") {
        rowValidation.ownerLogin.exists = true;
        rowValidation.ownerLogin.key = 'owner_login';
    } else if (row.hasOwnProperty('Owner Login') && row['Owner Login'] != "") {
        rowValidation.ownerLogin.exists = true;
        rowValidation.ownerLogin.key = 'Owner Login';
    }

    if(row.hasOwnProperty('item_id') && row['item_id'] != "") {
        rowValidation.itemId.exists = true;
        rowValidation.itemId.key = 'item_id';
    } else if (row.hasOwnProperty('Folder/File ID') && row['Folder/File ID'] != "") {
        rowValidation.itemId.exists = true;
        rowValidation.itemId.key = 'Folder/File ID';
    }

    if(row.hasOwnProperty('type') && row['type'] != "") {
        rowValidation.type.exists = true;
        rowValidation.type.key = 'type';
    } else if(row.hasOwnProperty('path') && row['path'] != "") {
        rowValidation.type.exists = true;
        rowValidation.type.key = 'path';
    } else if(row.hasOwnProperty('Path') && row['Path'] != "") {
        rowValidation.type.exists = true;
        rowValidation.type.key = 'Path';
    }

    if(rowValidation.ownerLogin.exists && rowValidation.itemId.exists && rowValidation.type.exists) {
        rowValidation.validationsPassed = true;
    } else {
        if(!rowValidation.ownerLogin.exists) {
            rowValidation.validationErrors.push(`"owner_login" OR "Owner Login"`);
        }

        if(!rowValidation.itemId.exists) {
            rowValidation.validationErrors.push(`"item_id" OR "Folder/File ID`);
        }

        if(!rowValidation.type.exists) {
            rowValidation.validationErrors.push(`"type" OR "Path"`);
        }
    }

    return rowValidation;
};

const normalizeRow = function(index, row, rowValidator) {

    function setItemType(typeOrPath) {
        if(typeOrPath === "web_link" || typeOrPath === "folder" || typeOrPath === "file") {
            return typeOrPath;
        }
        else if (typeOrPath.slice(0,4) === "http" ) {
            return "web_link";
        } else if (typeOrPath.slice(-1) === "/") {
            return "folder";
        } else {
            return "file";
        }
    }

    const normalizedRow = {
        ownerLogin: null,
        itemId: null,
        type: null
    };

    normalizedRow.ownerLogin = row[rowValidator.ownerLogin.key];
    normalizedRow.itemId = row[rowValidator.itemId.key];
    normalizedRow.type = setItemType(row[rowValidator.type.key]);
    
    return normalizedRow;
};

module.exports = { parseFile, validateRow, normalizeRow };
