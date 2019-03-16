# Introduction #
This script will traverse all items in a Box instance, and optionally allows for custom business logic (defined by the user) to be performed on each item retreived during traversal. Some additional features are offered which allow for more "advanced" capabilities such as a simulation mode to skip modifying data, a blacklist to skip processing of certain users or folders, and a whitelist to only process certain folders explicitly.

## Getting Started ##
You must already have your Box application [set up and authorized](https://developer.box.com/docs/setting-up-a-jwt-app) in your Box instance. You must also have Node 8 or above installed on your machine.

Once complete, follow the steps below to run the script:
1. Clone or download this repository
2. Navigate to the downloaded directory: `cd traverse-box-items`
3. Install dependencies: `npm install`
4. Run the script: `node traverse-box-items.js`
5. View results in the console or in the newly created `auditLogs` and `runtimeLogs` directories in the script root directory

# Features #
Below is a summary of the features offered by this script:

## Item Traversal ##
Out of the box this script will simply traverse all files, folders, and web links (ie. bookmarks) for all users in a Box instance. It will start by getting all users in the Box instance and then it will impersonnate each user to get the items they own. It will log all items to an audit CSV file for review.

## User Cache and Task Queue ##
This script implements an object called `userCache` which contains a Box user object, Box API client, and user-specific task queue for every in scope user that the script will process. Each object entry's key is defined by the Box user ID for which it represents, and every function is designed to use the relevant user context (Box API client) and tasks queue based on a user ID passed to that function.

The task queue ensures that Box is not overwhelmed by requests, which would trigger Box rate limiters, which can back up script execution and cause high memory utilization and eventually failures. Box rate limits are defined on a per-user basis and as such task queues are also defined on a per-user basis. Therefore, this script will perform the maximum number of tasks per user task queue per second as defined in `maxQueueTasksPerSecond` configuration option.

## User Defined Business Logic ##
During traversal the script will call a function `performUserDefinedActions` for each item processed. The script user can specify custom business logic in this function which will be evaluated for every item. This is useful if, for example, you need to modify shared link access levels or apply retention policies to items. You can see a sample implementation in the "User Defined Logic Examples" folders.

All custom Business Logic must be defined within the user-defined-logic.js file, where the `performUserDefinedActions` function is defined. The following data is available to you at function execution:

    ownerId [string]: User ID for the user who owns the item
    itemObj [object]: A Box item (file, folder, or web_link) object which can be processed or evaluated for processing
    parentExecutionID [string]: The execution ID from the loop which triggered the function

### Examples ###
The following User Defined Logic examples were built for common use cases. to use an example file, simply copy code form the example file and paste into the `user-defined-logic.js` file!

#### modifySharedLinks ####
Will check the current shared links of all items and, if the access level matches a certain value, will change the access level. For example, this example can change all "Open" (Public) shared link to "Company Only" shared links.

To leverage this example, the following configuration options must be added to the `userDefinedConfigs` object in [config.json](https://github.com/kmcroft13/traverse-box-items#config-file):
* matchSharedLinkAccessLevel: Current shared link access level you want to act upon
* newSharedLinkAccessLevel: Access level to change the shared link to

Possible options for these configuration values are: "open", "company", "collaborators"

## Logging ##
### Audit Logging ###
A `logAudit` function is exposed to write items to an audit CSV file which write actions the script performs. Audit logging is already implemented for basic traversal (and can be disable via config file). If adding custom User Defined Business Logic, you may also choose to audit your custom actions with this function. This function requires the following parameters:

    param [string] action: Action that is being audited
    param [object] boxItemObj: Box item object (folder, file, web_link)
    param [string] message: Additional details about the event
    param [string] executionID: Unique ID associated with a given execution loop

A new audit log file will be generated each time the script is executed.

### Runtime Logging ###
Audit logging is separate from runtime logs which are also collected during execution. Runtime logs are implemented through a series of `logger` methods. See [Winston documentation](https://github.com/winstonjs/winston) for info about these methods, or view the various examples already implemented in the script.

## Simulation Mode ##
If adding custom User Defined Business Logic, it is recommended to implement a "simulation mode" by leveraging the `modifyData` config flag. If the flag is `true` you can perform the actual action associated with your custom logic, while if the flag is `false` you can implement an audit log only version that does not actually modify any data. You can see a sample implementation in the example file.

## Process Non-Owned Items ##
By default the script is configured to skip items not owned by the user associated with the calling Box API client. This prevents the script from processing duplicate items for collaborated folders. However, there may be cases where you want to process non-owned, collaborated items especially when used in conjunction with the whitelist feature to limit the scope of which items the script will process.

## CSV ##
Instead of iterating through all users, the script can be configured to pull a pre-defined set of items to process from a CSV file. The CSV requires 3 columns: `type`, `item_id`, `owner_login`. This is useful if you already know the scope of the items you want to take action on (for example, but pulling a Folders and Files report from Box).

## Blacklist ##
The blacklist feature allows the user to configure specific users or folders to skip during processing. If these items are encountered during traversal, they will be skipped and no action will be performed. The item will be logged in runtime logs but will not be captured in audit event logs. The blacklist accepts an array of user IDs and / or an array of folder IDs.

## Whitelist ##
The whitelist feature allows the user to configure specific combinations of users and folders explicitly process. When the whitelist is enabled, no other items besides the ones explicitly configured will be processed. Items not included in the whitelist will not be processed and will not be included in the runtime logs or in audit event logs.
The whitelist is an array of objects. Each object requires two elements: `ownerID` and `folderIDs`.
* `ownerID` is a string representing the user ID for the user who owns the whitelisted folders.
* `folderIDs` is an array of strings representing the folder IDs which should be processed in the whitelist. All folder IDs within this array must be owned by the `ownerID` user defined above.
* `followAllChildItems` is a boolean which specifies whether or not the whitelist should apply to all child items throughout an entire structure, or if the whitelist should only apply to the specified item and its immediate children. In technical terms, controls whether or not recursion is performed.

# Config File #
_**NOTE**: The `boxAppSettings` object in the config is structured slightly differently from the config file you may have downloaded from the Box Developer Console. Please copy values from your Box config file or elsewhere and paste into this structure directly._

* **modifyData** _[boolean]_: Whether or not data should be modified at runtime (if implemented for custom User Defined Business Logic)
* **auditTraversal** _[boolean]_: Whether or not items should be audit logged during traversal (setting to `true` will output an audit log for each processed item)
* **maxQueueTasksPerSecond** _[integer]_: 
* **nonOwnedItems** _[object]_: Container object for non-owned item configurations
    * **skip** _[boolean]_: Whether or not non-owned items should be skipped during processing.
    * **audit** _[boolean]_: Whether or not non-owned items should be audit logged during processing.
* **csv** _[object]_: Container object for CSV configurations
    * **enabled** _[boolean]_: Whether or not the script should process items from a CSV file
    * **filePath** _[string]_: If CSV option enabled, the file path to the CSV file that should be used
* **blacklist** _[object]_: Container object for blacklist configurations
    * **enabled** _[boolean]_: Whether or not the blacklist should be honored at runtime
    * **users** _[array]_: Array of user IDs which should be ignored at runtime
    * **folders** _[array]_: Array of folder IDs which should be ignored at runtime
* **whitelist** _[object]_: Container object for whitelist configurations
    * **enabled** _[boolean]_: Whether or not the whitelist should be honored at runtime
    * **items** _[array of objects]_: Array of objects which contains items to be included in whitelist.
        * **ownerID** _[string]_: The user ID of the user who owns the folder to be included in whitelist.
        * **folderIDs** _[array]_: Array of folder IDs which should be included in whitelist.
        * **followAllChildItems** _[boolean]_: Whether or not the whitelist should apply to all child items through recursion (`true`) or if only the whitelisted item and its immediate children should be processed (`false`).
* **userDefinedConfigs** _[object]_: Container object which can be used to store configurations needed in any custom User Defined Business Logic
* **boxItemFields** _[string]_: The object fields which are returned with each API response. This should be modified sparingly as certain fields are relied upon by log functions. **Fields should not be removed from this list.**
* **boxAppSettings** _[object]_: Container object for Box app configurations.
    * **clientID** _[string]_: The `client ID` of your Box app.
    * **clientSecret** _[string]_: The `client secret` of your Box app.
    * **appAuth** _[object]_: Container object for Box app `appAuth` configurations
        * **privateKey** _[string]_: Your private key associated with your Box app
        * **passphrase** _[string]_: The passphrase for your private key
        * **keyID** _[string]_: The public key ID associated with your Box app and private key.
    * **enterpriseID** _[string]_: The Box enterprise ID where you authorized your app
