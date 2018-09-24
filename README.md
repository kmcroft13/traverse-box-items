# Introduction #
This script will traverse all items in a Box instance, and optionally allows for custom business logic (defined by the user) to be performed on each item retreived during traversal. Some additional features are offered which allow for more "advanced" capabilities such as a simulation mode to skip modifying data, a blacklist to skip processing of certain users or folders, and a whitelist to only process certain folders explicitly.

# Features #
Below is a summary of the features offered by this script:

## Item Traversal ##
Out of the box this script will simply traverse all files, folders, and web links (ie. bookmarks) for all users in a Box instance. It will start by getting all users in the Box instance and then it will impersonnate each user to get the items they own. It will log all items to an audit CSV file for review.

## User Defined Business Logic ##
During traversal the script will call a function `performUserDefinedActions` for each item processed. The script user can specify custom business logic in this function which will be evaluated for every item. This is useful if, for examplem, you need to modify shared link access levels or apply retention policies to items. You can see a sample implementation in the example file. The following data is available to you at function execution:

    client [object]: A Box API client associated with the user who owns the item
    clientUserObj [object]: A Box user object for the user associated with the client
    itemObj [object]: A Box item (file, folder, or web_link) object which can be processed or evaluated for processing
    parentExecutionID [string]: The execution ID from the loop which triggered the function

## Audit Logging ##
A `logAudit` functionb is exposes to write items to an audit CSV file which write actions the script performs. Audit logging is already implemented for basic traversal (and can be disable via config file). If adding custom User Defined Business Logic, you may also choose to audit your custom actions with this function. This function requires the following parameters:

    param [string] action: Action that is being audited
    param [object] boxItemObj: Box item object (folder, file, web_link)
    param [string] message: Additional details about the event
    param [string] executionID: Unique ID associated with a given execution loop

Audit logging is separate from runtime logs which are also collected during execution.

## Simulation Mode ##
If adding custom User Defined Business Logic, it is recommended to implement a "simulation mode" by leveraging the `modifyData` config flag. If the flag is `true` you can perform the actual action associated with your custom logic, while if the flag is `false` you can implement an audit log only version that does not actually modify any data. You can see a sample implementation in the example file.

## Process Non-Owned Items ##
By default the script is configured to skip items not owned by the user associated with the calling Box API client. This prevents the script from processing duplicate items for collaborated folders. However, there may be cases where you want to process non-owned, collaborated items especially when used in conjunction with the whitelist feature to limit the scope of which items the script will process.

## Blacklist ##
The blacklist feature allows the user to configure specific users or folders to skip during processing. If these items are encountered during traversal, they will be skipped and no action will be performed. The item will be logged in runtime logs but will not be captured in audit event logs. The blacklist accepts an array of user IDs and / or an array of folder IDs.

## Whitelist ##
The whitelist feature allows the user to configure specific combinations of users and folders explicitly process. When the whitelist is enabled, no other items besides the ones explicitly configured will be processed. Items not included in the whitelist will not be processed and will not be included in the runtime logs or in audit event logs.
The whitelist is an array of objects. Each object requires two elements: `ownerID` and `folderIDs`:
* `ownerID` is a string representing the user ID for the user who owns the whitelisted folders.
* `folderIDs` is an array representing the folder IDs which should be processed in the whitelist. All folder IDs within this array must be owned by the `ownerID` user defined above.

# Config File #
* **modifyData** _[boolean]_: 
* **auditTraversal** _[boolean]_: 
* **nonOwnedItems** _[object]_: 
    * **skip** _[boolean]_:
    * **audit** _[boolean]_: 
* **blacklist** _[object]_:
    * **enabled** _[boolean]_:
    * **users** _[array]_:
    * **folders** _[array]_:
* **whitelist** _[object]_:
    * **enabled** _[boolean]_:
    * **items** _[array of objects]_:
        * **ownerID** _[string]_:
        * **folderIDs** _[array]_:
        * **followAllChildItems** _[boolean]_:
* **userDefinedConfigs** _[object]_:
* **boxItemFields** _[string]_:
* **boxAppSettings** _[object]_:
    * **clientID** _[string]_:
    * **clientSecret** _[string]_:
    * **appAuth** _[object]_:
        * **privateKey** _[string]_:
        * **passphrase** _[string]_:
        * **keyID** _[string]_:
    * **enterpriseID** _[string]_:
