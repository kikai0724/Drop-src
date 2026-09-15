const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

function getTimestamp() {
    const now = new Date();
    const date = now.toLocaleDateString('en-US');
    const time = now.toLocaleTimeString();
    
    return `${date} ${time}`; 
}

function formatArgs(args) {
    return args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg === null || arg === undefined) return String(arg);
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

function formatLog(prefixColor, prefix, ...args) {
    let msg = formatArgs(args);
    let formattedMessage = `${prefixColor}[${getTimestamp()}] ${prefix}\x1b[0m: ${msg}`;
    console.log(formattedMessage);
}

function backend(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[32m", "[Log]  TYPE: regular", ...args);
    } else {
        console.log(`\x1b[32m[Log]  TYPE: regular\x1b[0m: ${msg}`);
    }
}

function bot(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[33m", "[Log]  TYPE: bot ", ...args);
    } else {
        console.log(`\x1b[33m[Log]  TYPE: bot \x1b[0m: ${msg}`);
    }
}

function xmpp(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[34m", "[Log]  TYPE: xmpp ", ...args);
    } else {
        console.log(`\x1b[34m[Log]  TYPE: xmpp\x1b[0m: ${msg}`);
    }
}

function error(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[31m", "[Log]  TYPE: error", ...args);
    } else {
        console.log(`\x1b[31m[Log]  TYPE: error \x1b[0m: ${msg}`);
    }
}

function debug(...args) {
    if (config.bEnableDebugLogs) {
        let msg = args.join(" ");
        if (config.bEnableFormattedLogs) {
            formatLog("\x1b[35m", "[Log]  TYPE: debug", ...args);
        } else {
            console.log(`\x1b[35m[Log]  TYPE: debug\x1b[0m: ${msg}`);
        }
    }
}

function website(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[36m", "[Log]  TYPE: website ", ...args);
    } else {
        console.log(`\x1b[36m[Log]  TYPE: website\x1b[0m: ${msg}`);
    }
}

function admin(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[90m", "[Log]  TYPE: admin", ...args);
    } else {
        console.log(`\x1b[90m[Log]  TYPE: admin\x1b[0m: ${msg}`);
    }
}

function AutoRotation(...args) {
    if (config.bEnableAutoRotateDebugLogs) {
        let msg = args.join(" ");
        if (config.bEnableFormattedLogs) {
            formatLog("\x1b[36m", "[Shard-backend] AutoRotation Debug Log", ...args);
        } else {
            console.log(`\x1b[36m[Shard-backend] AutoRotation Debug Log\x1b[0m: ${msg}`);
        }
    }
}

function checkforupdate(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[33m", "[Log]  TYPE: update ", ...args);
    } else {
        console.log(`\x1b[33m[Log]  TYPE: update\x1b[0m: ${msg}`);
    }
}

function autobackendrestart(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[92m", "[Shard-backend] Auto Backend Restart Log", ...args);
    } else {
        console.log(`\x1b[92m[Shard-backend] Auto Backend Restart\x1b[0m: ${msg}`);
    }
}

function calderaservice(...args) {
    let msg = args.join(" ");
    if (config.bEnableFormattedLogs) {
        formatLog("\x1b[91m", "Caldera Service Log", ...args);
    } else {
        console.log(`\x1b[91mCaldera Service\x1b[0m: ${msg}`);
    }
}

module.exports = {
    backend,
    bot,
    xmpp,
    error,
    debug,
    website,
    admin,
    AutoRotation,
    checkforupdate,
    autobackendrestart,
    calderaservice
};