import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import TradeOfferManager from 'steam-tradeoffer-manager';
import { ToadScheduler } from 'toad-scheduler';
import { SimpleIntervalJob, Task } from 'toad-scheduler';
import fs from 'fs';

const participantsFilePath = 'C:\\Users\\rickv\\Desktop\\Secret Santa Bot\\participants.json';

var username = "";
var password = "";
var sharedSecret = "";
var identitySecret = "";

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
});

steam_client.on("webSession", (sessionID, cookies) => {
    manager.setCookies(cookies, (ERR) => { });
    community.setCookies(cookies);
    community.startConfirmationChecker(8000, identitySecret);
});

community.on('sessionExpired', function (err) {
    steam_client.webLogOn();
});

manager.on("newOffer", (OFFER) => {
    if (OFFER.itemsToGive.length == 0 && OFFER.itemsToReceive.length > 0) {
        OFFER.accept();
    }
});

community.on("newConfirmation", (CONF) => {
    community.acceptConfirmationForObject(identitySecret, CONF.id, error);
});

manager.on("newOffer", (offer) => {
    // Get the Steam ID of the sender
    const senderSteamID = offer.partner.getSteamID64();

    // Get asset IDs of items being received in the trade
    const receivedItems = offer.itemsToReceive.map(item => item.assetid);

    console.log(`Received trade offer from SteamID: ${senderSteamID}`);
    console.log(`Received items with asset IDs: ${receivedItems.join(', ')}`);

    // Load the participants.json file
    fs.readFile(participantsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading participants.json:', err);
            return;
        }

        // Parse the JSON data
        const participantsData = JSON.parse(data);

        // Find the user with the matching Steam ID
        const user = participantsData.find(participant => participant.steamID64 === senderSteamID);

        if (user) {
            // Update the user's data with the received asset IDs
            if (!user.sentItemAssetIDs) {
                user.sentItemAssetIDs = [];
            }
            user.sentItemAssetIDs.push(...receivedItems);

            // Save the updated data back to participants.json
            fs.writeFile(participantsFilePath, JSON.stringify(participantsData, null, 2), (err) => {
                if (err) {
                    console.error('Error writing participants.json:', err);
                } else {
                    console.log('User data updated and saved to participants.json');
                }
            });
        } else {
            console.log(`User with SteamID ${senderSteamID} not found in participants.json`);
        }
    });
});