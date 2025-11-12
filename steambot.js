import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import TradeOfferManager from 'steam-tradeoffer-manager';
import { ToadScheduler } from 'toad-scheduler';
import fs from 'fs';
import dotenv from 'dotenv';
import https from 'https';
import { fileURLToPath } from 'url';
import path from 'path';

const logChannelId = "1438169605163061289";

let participantsData = [];
const participantsFilePath = 'participants.json';
let discordClient = null; // Will be set by bot.js

dotenv.config()

// Check if this file is being run directly (not imported)
// Compare the current file path with the script being executed
const currentFile = fileURLToPath(import.meta.url);
const mainModule = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMainModule = mainModule && path.resolve(currentFile) === mainModule;

// Function to set the Discord client (called from bot.js)
export function setDiscordClient(client) {
    discordClient = client;
}

// Function to send log messages to Discord
function sendLogToDiscord(message) {
    if (!discordClient) {
        console.log('[Steam Bot Log]:', message);
        return;
    }
    
    const logChannel = discordClient.channels.cache.get(logChannelId);
    if (logChannel && logChannel.isText()) {
        logChannel.send(message).catch(console.error);
    } else {
        console.log('[Steam Bot Log]:', message);
    }
}

var username = process.env.STEAMUSERNAME;
var password = process.env.PASSWORD;
var sharedSecret = process.env.SHAREDSECRET;
var identitySecret = process.env.IDENTITYSECRET;

let steam_client = null;
let community = null;
let manager = null;
const scheduler = new ToadScheduler();

// Only initialize Steam client if running as standalone script
if (isMainModule) {
    steam_client = new SteamUser();
    community = new SteamCommunity();
    manager = new TradeOfferManager({
        "pollInterval": 10000,
        "steam": steam_client,
        "domain": "localhost",
        "language": "en",
        "globalAssetCache": true,
    });

    // Handle Steam Guard code requests
    steam_client.on('steamGuard', function(domain, callback) {
        console.log('Steam Guard code requested. Generating code...');
        if (!sharedSecret) {
            console.error('ERROR: SHAREDSECRET not found in environment variables!');
            console.error('Please make sure SHAREDSECRET is set in your .env file.');
            callback('ERROR: Shared secret not configured');
            return;
        }
        
        try {
            // Generate code without offset first (fallback)
            const code = SteamTotp.getAuthCode(sharedSecret);
            console.log('Generated Steam Guard code:', code);
            callback(code);
        } catch (error) {
            console.error('Error generating Steam Guard code:', error);
            // Try with time offset
            SteamTotp.getTimeOffset(function (err, offset, latency) {
                if (err) {
                    console.error('Error getting time offset:', err);
                    callback('ERROR: Could not generate code');
                    return;
                }
                const code = SteamTotp.getAuthCode(sharedSecret, offset);
                console.log('Generated Steam Guard code (with offset):', code);
                callback(code);
            });
        }
    });

    // Login with 2FA code
    var logOnOptions = {};
    if (!sharedSecret) {
        console.error('ERROR: SHAREDSECRET not found in environment variables!');
        console.error('Please make sure SHAREDSECRET is set in your .env file.');
    } else {
        SteamTotp.getTimeOffset(function (err, offset, latency) {
            if (err) {
                console.error('Error getting time offset:', err);
                console.log('Attempting login without time offset...');
                // Fallback: try without offset
                logOnOptions = {
                    "accountName": username,
                    "password": password,
                    "twoFactorCode": SteamTotp.getAuthCode(sharedSecret)
                };
            } else {
                logOnOptions = {
                    "accountName": username,
                    "password": password,
                    "twoFactorCode": SteamTotp.getAuthCode(sharedSecret, offset)
                };
            }
            console.log('Logging in to Steam...');
            steam_client.logOn(logOnOptions);
        });
    }

    steam_client.on('loggedOn', function () {
        console.log('Successfully logged into Steam!');
        steam_client.setPersona(SteamUser.EPersonaState.Online);
        steam_client.gamesPlayed(730);
        sendLogToDiscord('✅ Successfully logged into Steam!');
    });

    steam_client.on('error', function(err) {
        console.error('Steam client error:', err);
        sendLogToDiscord('❌ Steam client error: ' + err.message);
    });
}

if (isMainModule && steam_client) {
    steam_client.on("webSession", (sessionID, cookies) => {
        manager.setCookies(cookies, (ERR) => {
            if (ERR) {
                sendLogToDiscord('Error setting cookies for trade manager:', ERR);
            } else {
                sendLogToDiscord('Cookies set for trade manager.');
            }
        });
        community.setCookies(cookies);
        community.startConfirmationChecker(8000, identitySecret);
    });

    community.on('sessionExpired', function (err) {
        steam_client.webLogOn();
        sendLogToDiscord('Session expired, relogging...');
    });

    manager.on("newOffer", (offer) => {
    if (offer.itemsToGive.length == 0 && offer.itemsToReceive.length > 0) {
        offer.accept();
    }

    // Get the Steam ID of the sender
    const senderSteamID = offer.partner.getSteamID64();

    // Extract item information including market hash name, pattern, and float
    // These properties remain constant and uniquely identify items
    const receivedItems = offer.itemsToReceive.map(item => {
        const itemInfo = {
            classid: item.classid,
            appid: item.appid || 730,
            contextid: item.contextid || 2
        };
        
        // Get market hash name (item name with wear condition)
        if (item.market_hash_name) {
            itemInfo.market_hash_name = item.market_hash_name;
        }
        
        // Get pattern index (for items with variations like patterns, stickers)
        if (item.pattern_index !== undefined) {
            itemInfo.pattern_index = item.pattern_index;
        }
        
        // Get float value (wear value, unique per item)
        if (item.float_value !== undefined) {
            itemInfo.float_value = item.float_value;
        }
        
        // Get item name from description if available
        if (item.name) {
            itemInfo.name = item.name;
        }
        
        return itemInfo;
    });

    const classIDs = receivedItems.map(item => item.classid);
    const itemNames = receivedItems.map(item => item.market_hash_name || item.name || `Class ID: ${item.classid}`).join(', ');

    sendLogToDiscord(`Received trade offer from SteamID: ${senderSteamID}`);
    sendLogToDiscord(`Received items: ${itemNames}`);

    // Load the participants.json file
    fs.readFile(participantsFilePath, 'utf8', (err, data) => {
        if (err) {
            sendLogToDiscord('Error reading participants.json:', err);
            return;
        }

        // Parse the JSON data
        const participantsData = JSON.parse(data);

        // Find the user with the matching Steam ID
        const user = participantsData.find(participant => participant.steamID64 === senderSteamID);

        if (user) {
            // Update the user's data with the received items (class IDs only)
            // We store class IDs because asset IDs change after trade acceptance
            if (!user.sentItems) {
                user.sentItems = [];
            }
            // Store item info with class ID (asset IDs will be looked up when sending)
            user.sentItems.push(...receivedItems);
            
            // Keep backward compatibility with sentItemClassIDs
            if (!user.sentItemClassIDs) {
                user.sentItemClassIDs = [];
            }
            user.sentItemClassIDs.push(...classIDs);

            // Save the updated data back to participants.json
            fs.writeFile(participantsFilePath, JSON.stringify(participantsData, null, 2), (err) => {
                if (err) {
                    sendLogToDiscord('Error writing participants.json:', err);
                } else {
                    sendLogToDiscord(`${senderSteamID} updated and saved to participants.json`);
                }
            });
        } else {
            sendLogToDiscord(`User with SteamID ${senderSteamID} not found in participants.json`);
        }
    });
    });

    community.on("newConfirmation", (CONF) => {
        community.acceptConfirmationForObject(identitySecret, CONF.id, error);
    });
}

console.log('Reading participants data from participants.json...');
fs.readFile(participantsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading participants.json:', err);
        return;
    }
    participantsData = JSON.parse(data);

});

export function sendTrades() {
    if (!manager) {
        console.error('Steam trade manager not initialized. Make sure steambot.js is running as a standalone script.');
        return;
    }
    
    console.log('Sending trades...');

    // First, fetch the Steam API data once, replace the steamid with your bot account's steamid
    const url = 'https://steamcommunity.com/inventory/76561199144623922/730/2?l=english&count=5000';

    https.get(url, (res) => {
        let steamData = '';

        res.on('data', (chunk) => {
            steamData += chunk;
        });

        res.on('end', () => {
            const parsedSteamData = JSON.parse(steamData);

            // Now, read the participants data
            fs.readFile(participantsFilePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading participants.json:', err);
                    return;
                }

                const updatedParticipantsData = JSON.parse(data);

                updatedParticipantsData.forEach((participant) => {
                    // Check if participant has items to send (prefer new sentItems format, fallback to sentItemClassIDs)
                    const itemsToSend = participant.sentItems || 
                        (participant.sentItemClassIDs ? participant.sentItemClassIDs.map(classID => ({ classid: classID })) : []);
                    
                    if (participant.assigned && itemsToSend.length > 0) {
                        const recipient = updatedParticipantsData.find((user) => user.userId === participant.assigned);

                        if (recipient && recipient.tradelink) {
                            const trade = manager.createOffer(recipient.tradelink);
                            trade.setMessage('Here is your secret santa gift, enjoy and have a merry Christmas!');

                            let itemsAdded = 0;
                            
                            // Track which asset IDs we've already used to avoid duplicates
                            const usedAssetIDs = new Set();
                            
                            // Create a map of classid to descriptions for faster lookup
                            const descriptionsMap = {};
                            if (parsedSteamData.descriptions) {
                                parsedSteamData.descriptions.forEach(desc => {
                                    if (desc.classid) {
                                        descriptionsMap[desc.classid] = desc;
                                    }
                                });
                            }
                            
                            // Loop through each item
                            itemsToSend.forEach((item) => {
                                if (!item.classid) {
                                    console.error('Error: Item missing class ID');
                                    return;
                                }
                                
                                let assetToUse = null;
                                
                                // Try to find matching asset using ALL available properties (market hash name, pattern, and float)
                                // All stored properties must match for a successful match
                                assetToUse = parsedSteamData.assets.find(asset => {
                                    // Skip if already used
                                    if (usedAssetIDs.has(asset.assetid)) {
                                        return false;
                                    }
                                    
                                    // Must match class ID, appid, and contextid
                                    if (asset.classid !== item.classid.toString() ||
                                        asset.appid !== (item.appid || 730) ||
                                        asset.contextid !== (item.contextid || 2)) {
                                        return false;
                                    }
                                    
                                    // Get the description for this asset
                                    const description = descriptionsMap[asset.classid];
                                    if (!description) {
                                        // If no description available, can't match on properties - skip
                                        return false;
                                    }
                                    
                                    // Check if we have any stored properties to match on
                                    const hasStoredProperties = item.market_hash_name || 
                                                               item.pattern_index !== undefined || 
                                                               item.float_value !== undefined;
                                    
                                    if (!hasStoredProperties) {
                                        // No stored properties, fallback to class ID match only
                                        return true;
                                    }
                                    
                                    // Match ALL available properties - all must match
                                    let matches = true;
                                    
                                    // Match market hash name (if stored, must match)
                                    if (item.market_hash_name) {
                                        if (!description.market_hash_name || 
                                            description.market_hash_name !== item.market_hash_name) {
                                            matches = false;
                                        }
                                    }
                                    
                                    // Match pattern index (if stored, must match)
                                    if (item.pattern_index !== undefined) {
                                        if (description.pattern_index === undefined || 
                                            description.pattern_index !== item.pattern_index) {
                                            matches = false;
                                        }
                                    }
                                    
                                    // Match float value (if stored, must match with tolerance)
                                    if (item.float_value !== undefined) {
                                        if (description.float_value === undefined) {
                                            matches = false;
                                        } else {
                                            const tolerance = 0.000001;
                                            if (Math.abs(description.float_value - item.float_value) > tolerance) {
                                                matches = false;
                                            }
                                        }
                                    }
                                    
                                    return matches;
                                });

                                if (assetToUse) {
                                    // Mark this asset as used
                                    usedAssetIDs.add(assetToUse.assetid);
                                    
                                    // Add the assetid to the trade
                                    trade.addMyItem({
                                        appid: item.appid || 730,
                                        contextid: item.contextid || 2,
                                        assetid: assetToUse.assetid
                                    });
                                    itemsAdded++;
                                    
                                    const itemName = item.market_hash_name || item.name || `Class ID: ${item.classid}`;
                                    console.log(`Added item to trade: ${itemName}`);
                                } else {
                                    const itemName = item.market_hash_name || item.name || `Class ID: ${item.classid}`;
                                    console.error(`Error: Could not find matching item in inventory - ${itemName}`);
                                    sendLogToDiscord(`⚠️ Could not find item in inventory - ${itemName}`);
                                }
                            });

                            // Send the trade offer once all items are added
                            if (itemsAdded > 0) {
                                trade.send((err, status) => {
                                    if (err) {
                                        console.error('Error sending trade:', err);
                                        sendLogToDiscord(`❌ Error sending trade to ${recipient.name}: ${err.message}`);
                                    } else {
                                        sendLogToDiscord(`✅ Trade sent to ${recipient.name} with ${itemsAdded} item(s)!`);
                                    }
                                });
                            } else {
                                sendLogToDiscord(`⚠️ No items found in inventory for ${recipient.name}`);
                            }
                        }
                    }
                });
            });
        });

    }).on('error', (err) => {
        console.error('Error fetching Steam API data:', err);
    });
}


