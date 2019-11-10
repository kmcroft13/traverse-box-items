const generateExecutionId = function() {
    const execIdLength = 10;
    const execId = [...Array(execIdLength)].map(_=>(Math.random()*36|0).toString(36)).join``;
    return execId;
};

module.exports = { generateExecutionId };