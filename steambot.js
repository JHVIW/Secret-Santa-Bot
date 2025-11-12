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

    // Get class IDs of items being received in the trade
    const receivedItems = offer.itemsToReceive.map(item => item.classid);

    sendLogToDiscord(`Received trade offer from SteamID: ${senderSteamID}`);
    sendLogToDiscord(`Received items with class IDs: ${receivedItems.join(', ')}`);

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
            // Update the user's data with the received class IDs
            if (!user.sentItemClassIDs) {
                user.sentItemClassIDs = [];
            }
            user.sentItemClassIDs.push(...receivedItems);

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
                    if (participant.assigned && participant.sentItemClassIDs && participant.sentItemClassIDs.length > 0) {
                        const recipient = updatedParticipantsData.find((user) => user.userId === participant.assigned);

                        if (recipient && recipient.tradelink) {
                            const trade = manager.createOffer(recipient.tradelink);

                            trade.setMessage('Here is your secret santa gift, enjoy and have a merry Christmas!');

                            // Loop through each classID and find the corresponding assetid from the pre-fetched steamData
                            participant.sentItemClassIDs.forEach((classID) => {
                                const matchingAsset = parsedSteamData.assets.find(asset => asset.classid === classID.toString());

                                if (matchingAsset) {
                                    // Add the assetid to the trade
                                    trade.addMyItem({
                                        appid: 730,
                                        contextid: 2,
                                        assetid: matchingAsset.assetid
                                    });

                                    // Send the trade offer (this can be moved outside if you want to batch add all items before sending)
                                    trade.send((err, status) => {
                                        if (err) {
                                            console.error('Error sending trade:', err);
                                        } else {
                                            sendLogToDiscord('Trade sent!');
                                        }
                                    });
                                } else {
                                    console.error('Error fetching assetId for classId:', classID);
                                }
                            });
                        }
                    }
                });
            });
        });

    }).on('error', (err) => {
        console.error('Error fetching Steam API data:', err);
    });
}


