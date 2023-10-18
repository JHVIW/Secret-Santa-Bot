import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import TradeOfferManager from 'steam-tradeoffer-manager';
import { ToadScheduler } from 'toad-scheduler';
import fs from 'fs';
import dotenv from 'dotenv';
import https from 'https';

import Discord from 'discord.js';
const { Client, Intents } = Discord;
const intents = new Intents([
    Intents.FLAGS.GUILDS,           // Required for basic information about servers
    Intents.FLAGS.GUILD_MESSAGES,   // Required for message-related events
]);
const client = new Client({ intents });

const logChannelId = "1159534191457861715";

let participantsData = [];
const participantsFilePath = 'participants.json';
dotenv.config()

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', (message) => {
    if (message.content === '!senditemsforsecretsanta') {
        // Trigger the trade sending process immediately
        sendTrades();
    }
});

client.login(process.env.DISCORD_TOKEN);

function sendLogToDiscord(message) {
    const logChannel = client.channels.cache.get(logChannelId);
    if (logChannel && logChannel.isText()) {
        logChannel.send(message);
    } else {
        console.error(`Log channel with ID ${logChannelId} not found or not a text channel.`);
    }
}

var username = process.env.STEAMUSERNAME;
var password = process.env.PASSWORD;
var sharedSecret = process.env.SHAREDSECRET;
var identitySecret = process.env.IDENTITYSECRET;

let steam_client = new SteamUser();
let community = new SteamCommunity();
const scheduler = new ToadScheduler();
let manager = new TradeOfferManager({
    "pollInterval": 10000,
    "steam": steam_client,
    "domain": "localhost",
    "language": "en",
    "globalAssetCache": true,

});


var logOnOptions = {};
SteamTotp.getTimeOffset(function (err, offset, latency) {
    logOnOptions = {
        "accountName": username,
        "password": password,
        "twoFactorCode": SteamTotp.getAuthCode(sharedSecret, offset)
    };
    steam_client.logOn(logOnOptions);
});

steam_client.on('loggedOn', function () {
    steam_client.setPersona(SteamUser.EPersonaState.Online);
    steam_client.gamesPlayed(730);
});

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

console.log('Reading participants data from participants.json...');
fs.readFile(participantsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading participants.json:', err);
        return;
    }
    participantsData = JSON.parse(data);

});

function sendTrades() {
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


