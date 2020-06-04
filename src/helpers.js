//Require node fs module
const fs = require('fs');


const generateExecutionId = () => {
    const execIdLength = 10;
    const execId = [...Array(execIdLength)].map(_=>(Math.random()*36|0).toString(36)).join``;
    return execId;
};


//Get the caller function (used for logging purposes)
function getFunctionName() {
    return getFunctionName.caller.name
};


// Load JSON from script config file
const loadConfigs = () => {
    const scriptConfigFileName = './config.json';
    const scriptConfigFileContent = fs.readFileSync(`./${scriptConfigFileName}`);
    let config;
    try {
        config = JSON.parse(scriptConfigFileContent);
    } catch(err) {
        throw Error(`Could not read configuration file: ${err}`)
    }
    //Check for incompatible configurations
    if((config.csv.enabled && config.whitelist.enabled) || (config.csv.enabled && config.blacklist.enabled)) {
        console.log(`\n\n=============== WARNING ===============\nThe "whitelist" and "blacklist" features cannot be used while the "CSV" feature is enabled.\nPlease either turn off the "CSV" feature or turn off both the "whitelist" and "blacklist" features and re-run the script to proceed.\n=======================================\n\n`)
        process.exit(9);
    };

    return config;
};

module.exports = { generateExecutionId, loadConfigs, getFunctionName };